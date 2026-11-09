import importlib.util
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('translator_setup', ROOT / 'deployment/scripts/azure.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class TranslationConfigTest(unittest.TestCase):
    def test_key_stays_in_ssm_not_state_or_output(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder) / 'translator.json'
            response = io.BytesIO(json.dumps([{'translations':[{'text':'Hello','to':'en'}]}]).encode())
            opener = mock.Mock(open=mock.Mock(return_value=response))
            with mock.patch.object(setup,'TRANSLATOR_STATE',state), mock.patch.object(setup.sys.stdin,'isatty',return_value=True), \
                 mock.patch.object(setup.getpass,'getpass',return_value='private-test-key'), mock.patch.object(setup.urllib.request,'build_opener',return_value=opener), \
                 mock.patch.object(setup,'aws') as aws, mock.patch('sys.stdout',new_callable=io.StringIO) as output:
                setup.configure_translator('eastasia')
                self.assertEqual(setup.translator_overrides(),{'TranslatorApiParameterName':setup.TRANSLATOR_PARAMETER,'AzureTranslatorRegion':'eastasia'})
                self.assertNotIn('private-test-key',state.read_text()+output.getvalue())
                self.assertEqual(aws.call_args.kwargs['payload']['Value'],'private-test-key')
                self.assertEqual(aws.call_args.kwargs['payload']['Type'],'SecureString')
                if os.name != "nt":  # Windows không có quyền file kiểu POSIX.
                    self.assertEqual(state.stat().st_mode & 0o777,0o600)

    def test_unconfigured_does_not_enable_feature(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(setup,'TRANSLATOR_STATE',Path(folder)/'missing'):
            self.assertEqual(setup.translator_overrides(),{})

    def test_corrupt_state_or_region_fails_before_aws(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(setup,'aws') as aws:
            state = Path(folder)/'config'
            with mock.patch.object(setup,'TRANSLATOR_STATE',state):
                state.write_text(json.dumps({'parameter':'wrong','region':'eastasia'}))
                with self.assertRaises(ValueError): setup.translator_overrides()
                with self.assertRaises(ValueError): setup.configure_translator('eastasia/../../')
            aws.assert_not_called()
