Set ws = CreateObject("Wscript.Shell")
ws.Run "pythonw.exe """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\DeepSeek_API余额.py""", 0, False
