using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Graphics.Imaging;
using Windows.Storage.Pickers;
using Windows.Storage.Streams;
using WinRT.Interop;

namespace GutenbergWindows;
public sealed partial class LayoutsPage : Page
{
    private string? fontPath;
    public LayoutsPage() => InitializeComponent();
    private void UpdatePreview(object sender, object e)
    {
        if (PreviewTitle is null) return; PreviewTitle.Text = TitleText.Text; PreviewSubtitle.Text = SubtitleText.Text.ToUpperInvariant(); PreviewBody.Text = BodyText.Text;
        var tag = (Preset.SelectedItem as ComboBoxItem)?.Tag?.ToString(); var size = tag switch { "story" => (1080d,1920d), "cover" => (1600d,900d), "poster" => (1240d,1754d), "card" => (1050d,600d), _ => (1080d,1080d) }; Canvas.Width = size.Item1; Canvas.Height = size.Item2;
    }
    private async void Font_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker(); InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(App.MainWindow)); foreach (var e2 in new[] { ".otf", ".ttf", ".woff", ".woff2", ".ttc" }) picker.FileTypeFilter.Add(e2);
        var file = await picker.PickSingleFileAsync(); if (file is null) return; fontPath = file.Path;
        try { await Api.MultipartAsync("layouts/api/metrics", new[] { file.Path }, "font"); PreviewTitle.FontFamily = new FontFamily(file.Path + "#" + Path.GetFileNameWithoutExtension(file.Path)); FontStatus.Text = file.Name + " · метрики загружены"; }
        catch (Exception ex) { Error(ex.Message); }
    }
    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var bitmap = new RenderTargetBitmap(); await bitmap.RenderAsync(Canvas, (int)Canvas.Width, (int)Canvas.Height); var pixels = await bitmap.GetPixelsAsync();
            var picker = new FileSavePicker { SuggestedFileName = (Preset.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "layout" }; picker.FileTypeChoices.Add("PNG", new[] { ".png" }); InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(App.MainWindow)); var file = await picker.PickSaveFileAsync(); if (file is null) return;
            await using var stream = await file.OpenStreamForWriteAsync(); var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream.AsRandomAccessStream()); encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, (uint)bitmap.PixelWidth, (uint)bitmap.PixelHeight, 96, 96, pixels.ToArray()); await encoder.FlushAsync(); Status.Message = $"Готово: {file.Name}"; Status.Severity = InfoBarSeverity.Success; Status.IsOpen = true;
        }
        catch (Exception ex) { Error(ex.Message); }
    }
    private void Error(string value) { Status.Message = value; Status.Severity = InfoBarSeverity.Error; Status.IsOpen = true; }
}
