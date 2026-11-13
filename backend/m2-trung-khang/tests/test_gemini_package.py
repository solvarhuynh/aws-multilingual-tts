import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('gemini_packager', ROOT / 'deployment/scripts/azure.py')
setup = importlib.util.module_from_spec(spec); spec.loader.exec_module(setup)


class GeminiPackageTest(unittest.TestCase):
    def test_disabled_provider_keeps_original_packaging_and_never_installs(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(setup.subprocess, 'run') as run:
            with setup.packaged_template(Path(folder)) as template:
                self.assertEqual(template, ROOT / 'deployment/template.yaml')
            run.assert_not_called()

    def test_linux_dependency_staging_preserves_paths_and_cleans_its_temporary_directory(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(setup.subprocess, 'run', return_value=mock.Mock(returncode=0)) as run:
            with setup.packaged_template(Path(folder), True) as template:
                self.assertTrue(template.is_file())
                root = template.read_text()
                child = template.with_name('tts.yaml').read_text()
                self.assertIn('Location: ' + json.dumps(str(ROOT / 'backend/m3-trung-duc/infra/storage.yaml')), root)
                self.assertIn('CodeUri: ' + json.dumps(str(template.parent / 'synthesize')), child)
                self.assertTrue((template.parent / 'synthesize/providers/gemini.py').is_file())
                args = run.call_args.args[0]
                self.assertIn('manylinux2014_x86_64', args)
                self.assertIn('3.12', args)
                self.assertIn('--only-binary=:all:', args)
            self.assertFalse(template.exists())

    def test_failed_encoder_build_stops_before_yielding_template(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(setup.subprocess, 'run', return_value=mock.Mock(returncode=1)):
            with self.assertRaisesRegex(ValueError, 'chưa tạo changeset'):
                with setup.packaged_template(Path(folder), True):
                    self.fail('Must not yield a broken build')
