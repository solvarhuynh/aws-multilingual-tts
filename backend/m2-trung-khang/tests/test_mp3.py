import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'synthesize'))
from providers.mp3 import join_mp3
from providers.base import PermanentProviderError


class Mp3Test(unittest.TestCase):
    def test_rejects_empty_truncated_or_different_profiles(self):
        frame = b'\xff\xf3\xa4\xc0' + bytes(284)
        other = b'\xff\xfb\x90\xc0' + bytes(413)
        for parts in [[], [b'',frame], [frame[:-1],frame], [frame,other], [b'ID3\x04',frame]]:
            with self.subTest(parts=[len(part) for part in parts]), self.assertRaises(PermanentProviderError):
                join_mp3(parts)
        self.assertEqual(join_mp3([frame]), frame)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Cần FFmpeg để kiểm duration/decoder thật')
    def test_real_cbr_and_vbr_duration_and_decode(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for options in [('-ar','24000','-ac','1','-b:a','96k'), ('-ar','44100','-ac','2','-q:a','3')]:
                parts = []
                durations = []
                for index, seconds in enumerate([1.1,1.7,2.3]):
                    path = root / f'{index}.mp3'
                    subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i',f'sine=frequency={440+index*100}:duration={seconds}',*options,str(path)],check=True,capture_output=True)
                    parts.append(path.read_bytes())
                    durations.append(float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(path)]))['format']['duration']))
                result = root / 'joined.mp3'
                result.write_bytes(join_mp3(parts))
                duration = float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(result)]))['format']['duration'])
                self.assertAlmostEqual(duration, sum(durations), delta=0.15)
                decoded = subprocess.run(['ffmpeg','-v','error','-i',str(result),'-f','null','-'],capture_output=True,check=True)
                self.assertEqual(decoded.stderr,b'')
