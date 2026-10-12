// Hides the extra console window on Windows release builds; no effect on macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    strategy_war_lib::run()
}
