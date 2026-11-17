# Creates the "PromptForge" desktop shortcut (launch.vbs starts the server without a console window).
$app = Split-Path -Parent $MyInvocation.MyCommand.Path
$desk = [Environment]::GetFolderPath('Desktop')
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path $desk 'PromptForge.lnk'))
$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$lnk.Arguments = '"' + (Join-Path $app 'launch.vbs') + '"'
$lnk.WorkingDirectory = $app
$lnk.IconLocation = (Join-Path $app 'assets\promptforge-app.ico') + ',0'
$lnk.Description = 'PromptForge - doc-grounded prompt engineering for any AI model'
$lnk.WindowStyle = 1
$lnk.Save()
Write-Output "Shortcut created: $(Join-Path $desk 'PromptForge.lnk')"
