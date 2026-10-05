import Foundation
import JavaScriptCore

@MainActor final class LanguageEngine {
    private let context: JSContext
    init() throws {
        guard let context = JSContext(), let url = Bundle.main.url(forResource: "LanguageCore", withExtension: "js") else {
            throw AppFailure("Sprachregeln fehlen in der App.")
        }
        self.context = context
        context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        guard context.exception == nil else { throw AppFailure("Sprachregeln konnten nicht geladen werden.") }
    }
    func call(_ operation: String, _ arguments: [String: Any] = [:]) throws -> Any {
        var args = arguments; args["operation"] = operation
        let data = try JSONSerialization.data(withJSONObject: args)
        context.exception = nil
        guard let input = String(data: data, encoding: .utf8),
              let output = context.objectForKeyedSubscript("mobileCall")?.call(withArguments: [input])?.toString(),
              context.exception == nil,
              let result = try JSONSerialization.jsonObject(with: Data(output.utf8)) as? [String: Any] else {
            throw AppFailure("Lokale Sprachauswertung fehlgeschlagen.")
        }
        guard result["ok"] as? Bool == true, let value = result["value"] else {
            throw AppFailure(result["error"] as? String ?? "Sprachanfrage ungültig.")
        }
        return value
    }
    func decode<T: Decodable>(_ type: T.Type, operation: String, arguments: [String: Any]) throws -> T {
        let value = try call(operation, arguments)
        return try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: value))
    }
}
