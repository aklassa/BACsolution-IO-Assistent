"""Generate a self-contained Xcode project without CocoaPods or XcodeGen."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
project = root / "BACsolution.xcodeproj"
project.mkdir(exist_ok=True)
objects = []

def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()

def q(value):
    return json.dumps(str(value), ensure_ascii=False)

def add(name, body):
    objects.append(f"\t\t{uid(name)} = {{ {body} }};")
    return uid(name)

def items(values):
    return "(" + ", ".join(values) + ",)" if values else "()"

sources, resources, references = [], [], []
for p in sorted((root / "App").glob("*.swift")) + sorted((root / "Resources").glob("*.js")) + sorted((root / "Resources").glob("*.xcassets")):
    relative = p.relative_to(root).as_posix()
    swift = p.suffix == ".swift"
    file_type = 'sourcecode.swift' if swift else 'folder.assetcatalog' if p.suffix == '.xcassets' else 'sourcecode.javascript'
    ref = add("ref:" + relative, f"isa = PBXFileReference; lastKnownFileType = {file_type}; path = {q(relative)}; sourceTree = SOURCE_ROOT;")
    build = add("build:" + relative, f"isa = PBXBuildFile; fileRef = {ref};")
    references.append(ref)
    (sources if swift else resources).append(build)
info = add("ref:plist", "isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Resources/Info.plist; sourceTree = SOURCE_ROOT;")
product = add("product", "isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = BACsolution.app; sourceTree = BUILT_PRODUCTS_DIR;")
add("sources", f"isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {items(sources)}; runOnlyForDeploymentPostprocessing = 0;")
add("resources", f"isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = {items(resources)}; runOnlyForDeploymentPostprocessing = 0;")
add("frameworks", "isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;")
add("products", f"isa = PBXGroup; children = ({product},); name = Products; sourceTree = \"<group>\";")
add("main", f"isa = PBXGroup; children = {items(references + [info, uid('products')])}; sourceTree = \"<group>\";")

for scope in ["project", "target"]:
    configs = []
    for mode in ["Debug", "Release"]:
        if scope == "project":
            settings = {
                "CLANG_ENABLE_MODULES": "YES", "CLANG_ENABLE_OBJC_ARC": "YES",
                "SDKROOT": "iphoneos", "IPHONEOS_DEPLOYMENT_TARGET": "17.0",
                "SWIFT_VERSION": "5.0", "SWIFT_OPTIMIZATION_LEVEL": "-Onone" if mode == "Debug" else "-O",
                "DEBUG_INFORMATION_FORMAT": "dwarf" if mode == "Debug" else "dwarf-with-dsym",
                "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG" if mode == "Debug" else "",
                "ENABLE_TESTABILITY": "YES" if mode == "Debug" else "NO",
            }
        else:
            settings = {
                "PRODUCT_BUNDLE_IDENTIFIER": "de.bacsolution.io.assistent.dev",
                "PRODUCT_NAME": "BACsolution", "INFOPLIST_FILE": "Resources/Info.plist",
                "GENERATE_INFOPLIST_FILE": "NO", "CODE_SIGN_STYLE": "Automatic",
                "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
                "TARGETED_DEVICE_FAMILY": "1", "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator",
                "SUPPORTS_MACCATALYST": "NO", "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks",
                "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
                # Keep the iOS 17 base usable when the iOS 26 model is absent.
                "OTHER_LDFLAGS": "$(inherited) -weak_framework FoundationModels",
            }
        body = " ".join(f"{key} = {q(value)};" for key, value in settings.items())
        configs.append(add(f"{scope}:{mode}", f"isa = XCBuildConfiguration; buildSettings = {{ {body} }}; name = {mode};"))
    add(f"{scope}:config", f"isa = XCConfigurationList; buildConfigurations = {items(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;")

add("target", f"isa = PBXNativeTarget; buildConfigurationList = {uid('target:config')}; buildPhases = {items([uid('sources'), uid('frameworks'), uid('resources')])}; buildRules = (); dependencies = (); name = BACsolution; productName = BACsolution; productReference = {product}; productType = \"com.apple.product-type.application\";")
add("project", f"isa = PBXProject; attributes = {{ LastSwiftUpdateCheck = 1600; LastUpgradeCheck = 1600; }}; buildConfigurationList = {uid('project:config')}; compatibilityVersion = \"Xcode 14.0\"; developmentRegion = de; hasScannedForEncodings = 0; knownRegions = (de, en, Base); mainGroup = {uid('main')}; productRefGroup = {uid('products')}; projectDirPath = \"\"; projectRoot = \"\"; targets = ({uid('target')},);")
(project / "project.pbxproj").write_text("// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n" + "\n".join(objects) + f"\n\t}};\n\trootObject = {uid('project')};\n}}\n")
schemes = project / "xcshareddata/xcschemes"
schemes.mkdir(parents=True, exist_ok=True)
reference = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid("target")}" BuildableName="BACsolution.app" BlueprintName="BACsolution" ReferencedContainer="container:BACsolution.xcodeproj"/>'
(schemes / "BACsolution.xcscheme").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference}</BuildActionEntry></BuildActionEntries></BuildAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/>
 <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
print(f"Xcode-Projekt vorbereitet: {len(sources)} Swift-Dateien, {len(resources)} Ressourcen.")
