' ═══ DENTAL — Ouvre l'interface comme une application ═══════════════════════
' Ouvre le logiciel dans une FENÊTRE DÉDIÉE (sans barre de navigateur), qui
' s'affiche et s'épingle à la barre des tâches comme un vrai programme.
' Edge (présent sur Windows 10/11) en mode --app ; sinon navigateur par défaut.
' Le serveur est démarré automatiquement à l'ouverture de session (tâche planifiée).
Option Explicit
Dim sh, fso, url, edge, pf86, pf
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
url = "http://localhost:3000"

pf86 = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
pf   = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"

If fso.FileExists(pf86) Then
  sh.Run """" & pf86 & """ --app=" & url, 1, False
ElseIf fso.FileExists(pf) Then
  sh.Run """" & pf & """ --app=" & url, 1, False
Else
  sh.Run url, 1, False
End If
