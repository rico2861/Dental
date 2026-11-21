' DENTAL — démarre le serveur sans fenêtre visible
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run """" & dir & "launch.bat""", 0, False
