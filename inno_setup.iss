[Setup]
AppId={{B3E7A5D0-4F1C-4E8A-9D6B-2A1C0F8E3D7B}
AppName=DME Equipment Checkout
AppVersion=1.0.0
AppPublisher=NW Montana Veterans Stand Down and Food Pantry
DefaultDirName={autopf}\DME Checkout
DefaultGroupName=DME Checkout
OutputDir=installer
OutputBaseFilename=DME-Checkout-Setup
Compression=lzma2/ultra64
SolidCompression=yes
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\DME-Checkout.exe
VersionInfoVersion=1.0.0.0
VersionInfoCompany=NW Montana Veterans Stand Down and Food Pantry
VersionInfoDescription=DME Equipment Checkout Database
VersionInfoProductName=DME Checkout
VersionInfoProductVersion=1.0.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\DME-Checkout\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\DME Checkout"; Filename: "{app}\DME-Checkout.exe"
Name: "{group}\{cm:UninstallProgram,DME Checkout}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\DME Checkout"; Filename: "{app}\DME-Checkout.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\DME-Checkout.exe"; Description: "{cm:LaunchProgram,DME Checkout}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
