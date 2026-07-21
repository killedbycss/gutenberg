using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace GutenbergWindows;

public sealed class BackendManager : IDisposable
{
    public static BackendManager Shared { get; } = new();
    public static readonly Uri BaseUri = new("http://127.0.0.1:8770/");
    private Process? process;

    public async Task StartAsync()
    {
        if (await HealthyAsync()) return;
        var root = Path.Combine(AppContext.BaseDirectory, "BackendRoot");
        var python = Path.Combine(AppContext.BaseDirectory, "Runtime", "python.exe");
        var server = Path.Combine(root, "studio", "backend", "app.py");
        if (!File.Exists(python)) throw new InvalidOperationException("Встроенный Python Runtime не найден. Выполните Packaging\\build.ps1 перед публикацией.");
        if (!File.Exists(server)) throw new InvalidOperationException("Не найдены ресурсы локальных модулей.");
        var support = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Gutenberg");
        Directory.CreateDirectory(support);
        process = Process.Start(new ProcessStartInfo(python, $"\"{server}\"")
        {
            WorkingDirectory = Path.Combine(root, "studio"), UseShellExecute = false,
            CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true,
            Environment = { ["PORT"] = "8770", ["DICT_PATH"] = Path.Combine(support, "user_dictionary.json"), ["PYTHONUTF8"] = "1" }
        });
        if (process is null) throw new InvalidOperationException("Не удалось запустить локальное ядро.");
        var log = Path.Combine(support, "backend.log");
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) File.AppendAllText(log, e.Data + Environment.NewLine); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) File.AppendAllText(log, e.Data + Environment.NewLine); };
        process.BeginOutputReadLine(); process.BeginErrorReadLine();
        for (var i = 0; i < 120; i++) { await Task.Delay(500); if (await HealthyAsync()) return; if (process.HasExited) break; }
        throw new InvalidOperationException($"Локальное ядро не запустилось. Журнал: {log}");
    }

    private static async Task<bool> HealthyAsync()
    {
        try { using var c = new HttpClient { Timeout = TimeSpan.FromSeconds(1) }; return (await c.GetAsync(new Uri(BaseUri, "healthz"))).IsSuccessStatusCode; }
        catch { return false; }
    }
    public void Dispose() { try { if (process is { HasExited: false }) process.Kill(true); } catch { } process?.Dispose(); }
}

public static class Api
{
    private static readonly HttpClient Client = new() { BaseAddress = BackendManager.BaseUri, Timeout = TimeSpan.FromMinutes(5) };
    public static async Task<JsonDocument> JsonAsync(string path, object body)
    {
        using var response = await Client.PostAsync(path, new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(Error(text, response.StatusCode.ToString()));
        return JsonDocument.Parse(text);
    }
    public static async Task<JsonDocument> GetAsync(string path)
    {
        var response = await Client.GetAsync(path); var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(Error(text, response.StatusCode.ToString()));
        return JsonDocument.Parse(text);
    }
    public static async Task<JsonDocument> DeleteAsync(string path)
    {
        var response = await Client.DeleteAsync(path); var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(Error(text, response.StatusCode.ToString()));
        return JsonDocument.Parse(text);
    }
    public static async Task<byte[]> MultipartAsync(string path, IEnumerable<string> files, string field, IEnumerable<KeyValuePair<string,string>>? values = null)
    {
        using var form = new MultipartFormDataContent();
        if (values is not null) foreach (var pair in values) form.Add(new StringContent(pair.Value), pair.Key);
        foreach (var file in files) { var content = new ByteArrayContent(await File.ReadAllBytesAsync(file)); content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream"); form.Add(content, field, Path.GetFileName(file)); }
        using var response = await Client.PostAsync(path, form); var data = await response.Content.ReadAsByteArrayAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(Error(Encoding.UTF8.GetString(data), response.StatusCode.ToString()));
        return data;
    }
    private static string Error(string json, string fallback) { try { var root = JsonDocument.Parse(json).RootElement; return root.TryGetProperty("detail", out var d) ? d.GetString()! : root.TryGetProperty("error", out var e) ? e.GetString()! : fallback; } catch { return fallback; } }
}
