import Cocoa
import SafariServices
class AppDelegate: NSObject, NSApplicationDelegate {
 var window: NSWindow!
 func applicationDidFinishLaunching(_ notification: Notification) {
  window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 230), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
  window.title = "Glowframe for Safari"
  let text = NSTextField(wrappingLabelWithString: "Enable Glowframe in Safari → Settings → Extensions, then allow access to YouTube.")
  text.frame = NSRect(x: 30, y: 100, width: 460, height: 90)
  window.contentView!.addSubview(text)
  let button = NSButton(title: "Open Safari Settings", target: self, action: #selector(settings))
  button.frame = NSRect(x: 130, y: 40, width: 260, height: 35)
  window.contentView!.addSubview(button)
  window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
 }
 @objc func settings() { SFSafariApplication.showPreferencesForExtension(withIdentifier: "io.github.in-vitr0.glowframe.extension") { _ in } }
 func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
