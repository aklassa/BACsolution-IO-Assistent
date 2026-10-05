import SwiftUI
import WebKit
import UIKit

// WebKit receives a real window lifecycle, but never a touch/keyboard surface.
// The native login form remains the only place where credentials are edited.
@MainActor final class ControllerTransportWebView: WKWebView {
    var onWindowAttached: (() -> Void)?
    override var canBecomeFirstResponder: Bool { false }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { onWindowAttached?() }
    }
}

@MainActor struct ControllerTransportView: UIViewRepresentable {
    @ObservedObject var session: LoytecSession

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.accessibilityElementsHidden = true
        view.clipsToBounds = true
        return view
    }

    func updateUIView(_ container: UIView, context: Context) {
        let webView = session.transportView
        guard webView.superview !== container else { return }
        container.subviews.forEach { $0.removeFromSuperview() }
        // Keep a usable viewport for the controller's desktop layout. SwiftUI
        // clips the host behind the opaque app content to a single point.
        webView.frame = CGRect(x: 0, y: 0, width: 390, height: 640)
        container.addSubview(webView)
    }
}
