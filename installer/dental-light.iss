; ═══ DENTAL LIGHT — Installeur Windows (Inno Setup) ═════════════════════════
; Installe le logiciel + Node embarqué, met le démarrage automatique en place,
; lance le serveur et ouvre l'écran d'activation (demande de licence).
; Compilé par ISCC.exe (voir .github/workflows/build-windows.yml).

#define AppName "DENTAL LIGHT"
#define AppVersion "1.0.0"
#define AppPublisher "DENTAL LIGHT"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\DENTAL LIGHT
DefaultGroupName=DENTAL LIGHT
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=DentalLight-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
UninstallDisplayName=DENTAL LIGHT

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "..\backend\*"; DestDir: "{app}\backend"; Excludes: ".env,data\*,storage\*,logs\*,backups\*"; Flags: recursesubdirs ignoreversion createallsubdirs
Source: "..\frontend\*"; DestDir: "{app}\frontend"; Flags: recursesubdirs ignoreversion createallsubdirs
Source: "..\db\*"; DestDir: "{app}\db"; Flags: recursesubdirs ignoreversion createallsubdirs
Source: "node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "launch.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Dossier des données, INSCRIPTIBLE par les utilisateurs (base, documents, sauvegardes, config)
Name: "{commonappdata}\DENTAL LIGHT"; Permissions: users-modify

[Icons]
Name: "{group}\DENTAL LIGHT"; Filename: "http://localhost:3000"
Name: "{group}\Démarrer le serveur"; Filename: "{app}\start-hidden.vbs"
Name: "{group}\Désinstaller DENTAL LIGHT"; Filename: "{uninstallexe}"
Name: "{commondesktop}\DENTAL LIGHT"; Filename: "http://localhost:3000"

[Run]
; Démarrage automatique à l'ouverture de session (tâche planifiée)
Filename: "schtasks"; Parameters: "/Create /F /SC ONLOGON /RL HIGHEST /TN ""DENTAL LIGHT"" /TR ""wscript.exe \""{app}\start-hidden.vbs\"""""; Flags: runhidden
; Démarrer maintenant
Filename: "wscript.exe"; Parameters: """{app}\start-hidden.vbs"""; Flags: runhidden nowait
; Ouvrir l'écran d'activation (demande de la licence) après l'installation
Filename: "http://localhost:3000"; Description: "Ouvrir DENTAL LIGHT et activer la licence"; Flags: shellexec postinstall nowait

[UninstallRun]
Filename: "schtasks"; Parameters: "/Delete /F /TN ""DENTAL LIGHT"""; Flags: runhidden
; Arrêter le serveur en cours
Filename: "taskkill"; Parameters: "/F /IM node.exe"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
; Note : les données ({commonappdata}\DENTAL LIGHT) NE sont PAS supprimées, pour ne rien perdre.
