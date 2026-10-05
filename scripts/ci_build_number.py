"""Stamp only the CI checkout, using Codemagic's counter for the entire app."""
from pathlib import Path
import os
import plistlib
import re
import subprocess

def build_number(counter, offset):
    if not re.fullmatch(r'[1-9][0-9]*', counter or ''):
        raise ValueError('PROJECT_BUILD_NUMBER fehlt oder ist ungueltig. Workflow in Codemagic starten.')
    if not re.fullmatch(r'0|[1-9][0-9]*', offset or ''):
        raise ValueError('BAC_IO_BUILD_OFFSET muss eine nichtnegative ganze Zahl sein.')
    value = int(counter) + int(offset)
    if value > 9999:
        raise ValueError('Buildnummer > 9999: Versionierungsstrategie vor dem Upload anpassen.')
    return str(value)

def main():
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphoneos', '--show-sdk-version'], text=True).strip()
    if not re.fullmatch(r'\d+(?:\.\d+)*', sdk) or int(sdk.split('.')[0]) < 26:
        raise ValueError('Fuer den Apple-Upload ist mindestens das iOS-26-SDK erforderlich.')
    value = build_number(os.environ.get('PROJECT_BUILD_NUMBER'), os.environ.get('BAC_IO_BUILD_OFFSET', '0'))
    path = Path(__file__).resolve().parents[1] / 'Resources/Info.plist'
    plist = plistlib.loads(path.read_bytes())
    plist['CFBundleVersion'] = value
    path.write_bytes(plistlib.dumps(plist, sort_keys=False))
    print(f'iOS SDK {sdk}; interner Testbuild {plist["CFBundleShortVersionString"]} ({value})')

if __name__ == '__main__':
    main()
