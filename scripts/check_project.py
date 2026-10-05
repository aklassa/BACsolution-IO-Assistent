"""Portable structure checks. This is NOT a Swift compiler or an iOS build."""
from pathlib import Path
import plistlib
import re
import json
import struct
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
plist = plistlib.loads((root / 'Resources/Info.plist').read_bytes())
for key in ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription', 'NSLocalNetworkUsageDescription']:
    assert plist.get(key), key
assert 'UIBackgroundModes' not in plist
assert not plist['NSAppTransportSecurity'].get('NSAllowsArbitraryLoads')
pbx = (root / 'BACsolution.xcodeproj/project.pbxproj').read_text()
definitions = re.findall(r'^\s*([A-F0-9]{24}) = \{', pbx, re.M)
assert len(set(definitions)) == len(definitions), 'Duplicate Xcode object IDs'
references = set(re.findall(r'\b[A-F0-9]{24}\b', pbx))
assert references == set(definitions), 'Missing Xcode objects'
for path in list((root / 'App').glob('*.swift')) + list((root / 'Resources').glob('*.js')):
    assert path.relative_to(root).as_posix() in pbx, f'Missing build input: {path.name}'
ET.parse(root / 'BACsolution.xcodeproj/xcshareddata/xcschemes/BACsolution.xcscheme')
assert 'Resources/Assets.xcassets' in pbx and 'ASSETCATALOG_COMPILER_APPICON_NAME' in pbx
icons = root / 'Resources/Assets.xcassets/AppIcon.appiconset'
catalog = json.loads((icons / 'Contents.json').read_text())
assert any(i['idiom'] == 'ios-marketing' and i['size'] == '1024x1024' for i in catalog['images'])
for icon in catalog['images']:
    raw = (icons / icon['filename']).read_bytes()
    width, height = struct.unpack('>II', raw[16:24])
    expected = int(icon['size'].split('x')[0]) * int(icon['scale'][0])
    assert width == height == expected, icon['filename']
    assert raw[:8] == b'\x89PNG\r\n\x1a\n' and raw[25] == 2, 'RGB-App-Icon ohne Alphakanal erforderlich'
print('Projektstruktur, Ressourcen, Berechtigungen und Schema konsistent. Kein iOS-Build ausgeführt.')
