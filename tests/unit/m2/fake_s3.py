"""S3 giả trong bộ nhớ, có kiểm tra If-Match như S3 thật."""

import types


class ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class NoSuchKey(ClientError):
    def __init__(self):
        super().__init__("NoSuchKey")


class Body:
    def __init__(self, data):
        self.data = data

    def read(self):
        return self.data


class FakeS3:
    exceptions = types.SimpleNamespace(ClientError=ClientError, NoSuchKey=NoSuchKey)

    def __init__(self):
        self.objects = {}
        self.puts = []
        self.revision = 0
        self.before_put = None
        self.head_error = None

    def seed(self, bucket, key, data):
        self.revision += 1
        self.objects[bucket, key] = (data, f'"etag-{self.revision}"')

    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise NoSuchKey()
        data, etag = self.objects[Bucket, Key]
        return {"Body": Body(data), "ETag": etag}

    def head_object(self, Bucket, Key):
        if self.head_error:
            raise ClientError(self.head_error)
        if (Bucket, Key) not in self.objects:
            raise ClientError("404")
        return {"ETag": self.objects[Bucket, Key][1]}

    def put_object(self, Bucket, Key, Body, **options):
        if self.before_put:
            hook, self.before_put = self.before_put, None
            hook()
        self.puts.append({"Bucket": Bucket, "Key": Key, **options})
        expected = options.get("IfMatch")
        if expected is not None and self.objects.get((Bucket, Key), (None, None))[1] != expected:
            raise ClientError("PreconditionFailed")
        self.seed(Bucket, Key, Body)
        return {"ETag": self.objects[Bucket, Key][1]}
