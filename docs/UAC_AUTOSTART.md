# UAC-Free Auto-Start Design

The helper does not need administrator rights. Keep the Spotify Web API helper as a normal per-user process on `127.0.0.1:53999`.

Use one of these designs:

1. Preferred MVP: Task Scheduler, current user, `Run only when user is logged on`, normal privileges.
2. Optional service: only if you later need the helper before sign-in. The service install/update step requires elevation, but normal boot startup does not show UAC.

Do not disable UAC system-wide and do not request `requireAdministrator` in the app manifest.

## Replace Any Elevated Windows Manifest

If the Kotlin app is packaged with a Windows app manifest that requests elevation, replace:

```xml
<requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
```

with:

```xml
<requestedExecutionLevel level="asInvoker" uiAccess="false" />
```

If your Gradle or jpackage config injects a manifest, make sure it points to the `asInvoker` manifest.

For Compose Desktop / jpackage, prefer a per-user installer directory and avoid machine-wide install locations:

```kotlin
compose.desktop {
    application {
        nativeDistributions {
            targetFormats(org.jetbrains.compose.desktop.application.dsl.TargetFormat.Exe)
            packageName = "Spotify Control Helper"
            packageVersion = "1.0.0"
            windows {
                perUserInstall = true
                menuGroup = "Spotify Control Helper"
                upgradeUuid = "PUT-YOUR-STABLE-UPGRADE-UUID-HERE"
            }
        }
    }
}
```

## Task Scheduler Implementation

Install the scheduled task from the release helper folder:

```text
helper\install-autostart-task.bat
```

Remove it with:

```text
helper\uninstall-autostart-task.bat
```

The task runs `helper\start-helper-task.ps1`, which:

- exits quietly if the user has not configured `config.local.json`
- exits quietly if the helper is already running
- starts `node.exe helper\server.js` hidden
- logs startup results to `helper\helper-autostart.log`

The task is created with `/RL LIMITED`, so it runs as the signed-in user without an elevation prompt on Windows 10 and Windows 11.

## Kotlin Launcher Option

If your GitHub Kotlin app launches Node itself, keep the Kotlin executable non-elevated and start Node as a child process:

```kotlin
import java.nio.file.Path

object HelperProcess {
    fun startNodeHelper(helperDir: Path): Process {
        val server = helperDir.resolve("server.js").toAbsolutePath().toString()

        return ProcessBuilder("node.exe", server)
            .directory(helperDir.toFile())
            .redirectOutput(helperDir.resolve("helper.log").toFile())
            .redirectErrorStream(true)
            .start()
    }
}
```

Register the Kotlin app itself with a normal-privilege scheduled task:

```kotlin
import java.nio.file.Path

fun installCurrentUserLogonTask(exePath: Path) {
    val taskName = "Spotify Control Helper"
    val command = listOf(
        "schtasks.exe",
        "/Create",
        "/TN", taskName,
        "/SC", "ONLOGON",
        "/TR", "\"${exePath.toAbsolutePath()}\"",
        "/RL", "LIMITED",
        "/F"
    )

    val process = ProcessBuilder(command)
        .redirectErrorStream(true)
        .start()

    val exitCode = process.waitFor()
    if (exitCode != 0) {
        error(process.inputStream.bufferedReader().readText())
    }
}
```

## Windows Service Option

Use a Windows service only if the helper must run before the user signs in. Install/update/uninstall will require admin rights, but regular boot startup will not prompt.

A simple service wrapper command with NSSM would look like:

```powershell
nssm install "Spotify Control Helper" "C:\Program Files\nodejs\node.exe" "C:\Path\To\helper\server.js"
nssm set "Spotify Control Helper" AppDirectory "C:\Path\To\helper"
nssm set "Spotify Control Helper" Start SERVICE_AUTO_START
nssm start "Spotify Control Helper"
```

For this project, Task Scheduler is the better fit because Spotify desktop, StreamDock, and the OAuth token are all per-user.
