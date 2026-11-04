// Hides the extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

/// Port the local server listens on. Waiter phones will connect to this same port later.
const SERVER_PORT: &str = "8787";

/// The running local server, so it can be stopped when the app closes.
struct LocalServer(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // In `tauri dev` the server is started by `bun run dev` instead (with hot reload).
            if cfg!(debug_assertions) {
                app.manage(LocalServer(Mutex::new(None)));
                return Ok(());
            }

            // Database and backups live in the app's data folder,
            // e.g. C:\Users\<name>\AppData\Roaming\in.kasuri.quickbill
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            // The waiter phone app, bundled with the installer and served to phones over Wi-Fi.
            let waiter_dir = app.path().resource_dir()?.join("waiter");

            let (mut events, child) = app
                .shell()
                .sidecar("kasuri-server")?
                .args([
                    "--data-dir".to_string(),
                    data_dir.to_string_lossy().into_owned(),
                    "--port".to_string(),
                    SERVER_PORT.to_string(),
                    "--waiter-dir".to_string(),
                    waiter_dir.to_string_lossy().into_owned(),
                ])
                .spawn()?;
            app.manage(LocalServer(Mutex::new(Some(child))));

            // Keep reading the server's output so its pipe never fills up.
            tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting Kasuri")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<LocalServer>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
