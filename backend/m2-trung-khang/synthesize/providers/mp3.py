"""Ghép các stream MPEG Layer III cùng định dạng, cập nhật duration/seek metadata."""

from .base import PermanentProviderError
from .common import MAX_AUDIO_BYTES


def _invalid():
    return PermanentProviderError("PROVIDER_INVALID_AUDIO", "Các đoạn âm thanh không cùng định dạng MP3 hợp lệ.")


def _frames(data):
    offset = 0
    while offset < len(data):
        if data[offset:offset + 3] == b"ID3":
            tag = data[offset:offset + 10]
            if len(tag) < 10 or any(byte & 128 for byte in tag[6:10]):
                raise _invalid()
            size = sum(byte << (7 * (3 - i)) for i, byte in enumerate(tag[6:10]))
            offset += 10 + size + (10 if tag[3] == 4 and tag[5] & 16 else 0)
            if offset > len(data):
                raise _invalid()
            continue
        if len(data) - offset == 128 and data[offset:offset + 3] == b"TAG":
            return
        word = int.from_bytes(data[offset:offset + 4], "big")
        version, layer = (word >> 19) & 3, (word >> 17) & 3
        rate_index, bitrate_index = (word >> 10) & 3, (word >> 12) & 15
        if word >> 21 != 2047 or version == 1 or layer != 1 or rate_index == 3 or bitrate_index in {0, 15}:
            raise _invalid()
        rates = (44100, 48000, 32000)
        rate = rates[rate_index] // (1 if version == 3 else 2 if version == 2 else 4)
        bitrates = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320) if version == 3 else (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
        size = (144000 if version == 3 else 72000) * bitrates[bitrate_index] // rate + ((word >> 9) & 1)
        if offset + size > len(data):
            raise _invalid()
        mono = (word >> 6) & 3 == 3
        tag_offset = 4 + (0 if (word >> 16) & 1 else 2) + ((17 if mono else 32) if version == 3 else (9 if mono else 17))
        yield data[offset:offset + size], (version, rate, mono), tag_offset
        offset += size


def join_mp3(parts):
    if len(parts) == 1:
        return parts[0]
    frames, profile, first_tag = [], None, None
    for part in parts:
        count = 0
        for frame, kind, tag in _frames(part):
            count += 1
            if profile is not None and profile != kind:
                raise _invalid()
            profile = kind
            # Mỗi stream có thể mở đầu bằng frame chỉ chứa bảng Xing/Info.
            # Giữ một bảng đầu file; bảng ở giữa không phải đoạn âm thanh.
            if frames and count == 1 and frame[tag:tag + 4] in {b"Xing", b"Info"}:
                continue
            if not frames:
                first_tag = tag
            frames.append(frame)
        if not count:
            raise _invalid()
    if not frames or sum(map(len, frames)) > MAX_AUDIO_BYTES:
        raise _invalid()
    first = bytearray(frames[0])
    tag = first_tag
    if bytes(first[tag:tag + 4]) in {b"Xing", b"Info"}:
        flags = int.from_bytes(first[tag + 4:tag + 8], "big")
        if flags & ~15 or tag + 8 > len(first):
            raise _invalid()
        cursor, size = tag + 8, sum(map(len, frames))
        for flag, value in ((1, len(frames) - 1), (2, size)):
            if flags & flag:
                if cursor + 4 > len(first):
                    raise _invalid()
                first[cursor:cursor + 4] = value.to_bytes(4, "big")
                cursor += 4
        if flags & 4:
            if cursor + 100 > len(first):
                raise _invalid()
            offsets, position = [], 0
            for frame in frames:
                offsets.append(position)
                position += len(frame)
            first[cursor:cursor + 100] = bytes(min(255, offsets[min(len(frames) - 1, i * len(frames) // 100)] * 256 // size) for i in range(100))
    return bytes(first) + b"".join(frames[1:])
