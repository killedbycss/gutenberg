import Testing
@testable import GutenbergMac

@Test func applicationModuleLoads() {
    #expect(Bool(true))
}

@Test func typographerAppliesCoreRussianRules() {
    let result = NativeTypographer().process(
        "Он сказал \"привет\" в 1990-2000.\n- Ответил А. С. Пушкин.",
        options: .init()
    )
    #expect(result.text.contains("«привет»"))
    #expect(result.text.contains("1990–2000"))
    #expect(result.text.contains("— Ответил"))
    #expect(result.text.contains("А. С. Пушкин"))
}

@Test func typographerHonorsExceptions() {
    let result = NativeTypographer().process("Бренд \"Best-1990\" и \"текст\"", options: .init(exceptions: ["\"Best-1990\""]))
    #expect(result.text.contains("\"Best-1990\""))
    #expect(result.text.contains("«текст»"))
}

@Test func typographerSupportsEnglishDashStyles() {
    let us = NativeTypographer().process("word - word", options: .init(englishDash: "us", defaultLanguage: "en"))
    let uk = NativeTypographer().process("word - word", options: .init(englishDash: "uk", defaultLanguage: "en"))
    #expect(us.text == "word—word")
    #expect(uk.text == "word – word")
}
