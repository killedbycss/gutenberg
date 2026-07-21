import AppKit
import CoreText
import Foundation
import SwiftUI

struct LayoutPurpose: Identifiable, Hashable {
    let id: String, title: String, group: String
    let width: CGFloat, height: CGFloat, dpi: Int
    let headlineCap, ratio, marginX, marginY, minBody: CGFloat
    let palette: LayoutPalette
    var safeZone: CGRect? = nil

    static let all: [LayoutPurpose] = [
        .init(id: "instagram-post", title: "Instagram — пост", group: "Соцсети", width: 1080, height: 1080, dpi: 72, headlineCap: 0.11, ratio: 1.5, marginX: 0.075, marginY: 0.075, minBody: 0.020, palette: .ink),
        .init(id: "instagram-story", title: "Instagram — story / Reels", group: "Соцсети", width: 1080, height: 1920, dpi: 72, headlineCap: 0.12, ratio: 1.5, marginX: 0.09, marginY: 0.06, minBody: 0.018, palette: .sunset),
        .init(id: "vk-cover", title: "VK — обложка сообщества", group: "Соцсети", width: 1590, height: 400, dpi: 72, headlineCap: 0.26, ratio: 1.4, marginX: 0.05, marginY: 0.14, minBody: 0.06, palette: .ocean, safeZone: CGRect(x: 0.13, y: 0, width: 0.74, height: 1)),
        .init(id: "poster-a3", title: "Постер A3 (портрет)", group: "Печать", width: 1754, height: 2480, dpi: 150, headlineCap: 0.12, ratio: 1.5, marginX: 0.08, marginY: 0.07, minBody: 0.014, palette: .paper),
        .init(id: "business-card", title: "Визитка (90×50 мм)", group: "Печать", width: 1063, height: 591, dpi: 300, headlineCap: 0.11, ratio: 1.35, marginX: 0.08, marginY: 0.10, minBody: 0.03, palette: .mono),
    ]
}

struct LayoutPalette: Hashable {
    var colors: [Color]
    var background: Color { colors.first ?? .black }
    var foreground: Color { colors.count > 1 ? colors[1] : .white }
    var accent: Color { colors.count > 2 ? colors[2] : foreground }
    var muted: Color { colors.count > 3 ? colors[3] : foreground.opacity(0.7) }
    static let ink = LayoutPalette(colors: [Color(hex: "0E0F12"), Color(hex: "F5F6F8"), Color(hex: "8AA0FF"), Color(hex: "AEB4C0")])
    static let paper = LayoutPalette(colors: [Color(hex: "F3EFE7"), Color(hex: "191510"), Color(hex: "B5461B"), Color(hex: "6B6157")])
    static let sunset = LayoutPalette(colors: [Color(hex: "2A1330"), Color(hex: "FFF1E8"), Color(hex: "FF8A5B"), Color(hex: "D3A9BE")])
    static let ocean = LayoutPalette(colors: [Color(hex: "0B2A3A"), Color(hex: "EAF6FF"), Color(hex: "48C6EF"), Color(hex: "9FC2D6")])
    static let mono = LayoutPalette(colors: [.white, Color(hex: "111111"), Color(hex: "111111"), Color(hex: "666666")])
}

enum LayoutVariant: String, CaseIterable, Identifiable {
    case topLeft, centered, bottomBand
    var id: Self { self }
    var title: String { switch self { case .topLeft: "Сверху"; case .centered: "По центру"; case .bottomBand: "Нижняя треть" } }
}

enum LayoutRole: String, CaseIterable, Identifiable {
    case headline, subhead, body, caption
    var id: Self { self }
    var title: String { switch self { case .headline: "Заголовок"; case .subhead: "Подзаголовок"; case .body: "Основной текст"; case .caption: "Подпись" } }
}

struct FontMetricsInfo: Hashable {
    var family = "System"
    var postScriptName: String?
    var unitsPerEm: CGFloat = 1000
    var capHeight: CGFloat = 700
    var xHeight: CGFloat = 500
    var ascent: CGFloat = 800
    var descent: CGFloat = -200
    var leading: CGFloat = 0
    var hasCyrillic = true
    var source = "системные метрики"
    var data: Data?
}

struct LayoutImage: Identifiable, Hashable {
    let id = UUID()
    var data: Data
    var name: String
}

struct LayoutFrame: Identifiable, Hashable {
    let id: String
    var role: LayoutRole?
    var imageID: UUID?
    var box: CGRect
    var fontSize: CGFloat = 40
    var lineHeight: CGFloat = 1.2
    var color: Color = .white
    var alignment: TextAlignment = .leading
    var imageFit = "contain"
    var zIndex = 2.0
    var hidden = false
}

struct NativeLayoutEngine {
    func generate(purpose: LayoutPurpose, variant: LayoutVariant, metrics: FontMetricsInfo, palette: LayoutPalette, images: [LayoutImage]) -> [LayoutFrame] {
        let short = min(purpose.width, purpose.height)
        let capRatio = max(0.2, metrics.capHeight / metrics.unitsPerEm)
        let headline = purpose.headlineCap * short / capRatio
        let subhead = headline / purpose.ratio
        let body = max(subhead / purpose.ratio, purpose.minBody * short)
        let caption = max(body / 1.2, purpose.minBody * short * 0.8)
        let natural = max(1, min(1.45, (metrics.ascent - metrics.descent + metrics.leading) / metrics.unitsPerEm))
        let mx = purpose.marginX, my = purpose.marginY, width = 1 - 2 * mx
        let origin: CGFloat = switch variant { case .topLeft: my; case .centered: 0.28; case .bottomBand: 0.55 }
        let align: TextAlignment = variant == .centered ? .center : .leading
        var frames: [LayoutFrame] = [
            .init(id: "headline", role: .headline, box: CGRect(x: mx, y: origin, width: width, height: 0.24), fontSize: headline, lineHeight: min(1.3, natural * 0.94), color: palette.foreground, alignment: align),
            .init(id: "subhead", role: .subhead, box: CGRect(x: mx, y: origin + 0.25, width: width, height: 0.12), fontSize: subhead, lineHeight: natural, color: palette.accent, alignment: align),
            .init(id: "body", role: .body, box: CGRect(x: mx, y: origin + 0.39, width: width * 0.76, height: 0.22), fontSize: body, lineHeight: min(1.7, natural * 1.15), color: palette.foreground, alignment: align),
            .init(id: "caption", role: .caption, box: CGRect(x: mx, y: 1 - my - 0.06, width: width, height: 0.05), fontSize: caption, lineHeight: natural, color: palette.muted, alignment: align),
        ]
        for (index, image) in images.enumerated() {
            let size = min(0.24, 0.19 + CGFloat(index) * 0.01)
            frames.append(.init(id: "image:\(image.id)", imageID: image.id,
                                box: CGRect(x: 1 - mx - size - CGFloat(index) * 0.035, y: my + CGFloat(index) * 0.035, width: size, height: size), zIndex: 3))
        }
        return frames
    }
}

enum FontLoader {
    static func load(url: URL) throws -> FontMetricsInfo {
        let data = try Data(contentsOf: url)
        return try load(data: data, name: url.deletingPathExtension().lastPathComponent)
    }

    static func load(data: Data, name: String) throws -> FontMetricsInfo {
        guard let provider = CGDataProvider(data: data as CFData), let font = CGFont(provider) else { throw APIError.message("Не удалось прочитать шрифт") }
        CTFontManagerRegisterGraphicsFont(font, nil)
        let ctFont = CTFontCreateWithGraphicsFont(font, 16, nil, nil)
        var character: UniChar = 0x0410
        var glyph: CGGlyph = 0
        let hasCyrillic = CTFontGetGlyphsForCharacters(ctFont, &character, &glyph, 1) && glyph != 0
        return FontMetricsInfo(
            family: font.fullName as String? ?? name,
            postScriptName: font.postScriptName as String?, unitsPerEm: CGFloat(font.unitsPerEm),
            capHeight: CGFloat(font.capHeight), xHeight: CGFloat(font.xHeight), ascent: CGFloat(font.ascent),
            descent: CGFloat(font.descent), leading: CGFloat(font.leading), hasCyrillic: hasCyrillic,
            source: font.capHeight > 0 ? "из таблиц шрифта" : "геометрическая оценка", data: data
        )
    }
}

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        let value = UInt64(clean, radix: 16) ?? 0
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
    var hexString: String {
        let color = NSColor(self).usingColorSpace(.deviceRGB) ?? .black
        return String(format: "#%02X%02X%02X", Int(color.redComponent * 255), Int(color.greenComponent * 255), Int(color.blueComponent * 255))
    }
}
