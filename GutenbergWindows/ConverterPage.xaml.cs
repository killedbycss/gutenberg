using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace GutenbergWindows;
public sealed partial class ConverterPage : Page
{
    private readonly List<string> paths = [];
    public ConverterPage() => InitializeComponent();
    private async void Add_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker(); InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(App.MainWindow));
        foreach (var ext in new[] { ".otf", ".ttf", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".webp" }) picker.FileTypeFilter.Add(ext);
        var chosen = await picker.PickMultipleFilesAsync(); paths.Clear(); paths.AddRange(chosen.Select(x => x.Path)); Files.ItemsSource = paths.Select(Path.GetFileName); FileCount.Text = $"Выбрано: {paths.Count}";
    }
    private void Clear_Click(object sender, RoutedEventArgs e) { paths.Clear(); Files.ItemsSource = null; FileCount.Text = "Файлы не выбраны"; }
    private async void Convert_Click(object sender, RoutedEventArgs e)
    {
        var choices = new[] { (Otf,"otf"),(Ttf,"ttf"),(Woff,"woff"),(Woff2,"woff2"),(Png,"png"),(Jpg,"jpg"),(Webp,"webp") }.Where(x => x.Item1.IsChecked == true).Select(x => new KeyValuePair<string,string>("targets",x.Item2)).ToArray();
        if (paths.Count == 0 || choices.Length == 0) { Error("Добавьте файлы и выберите формат результата."); return; }
        try
        {
            var data = await Api.MultipartAsync("converter/api/convert", paths, "fonts", choices);
            var picker = new FileSavePicker { SuggestedFileName = "converted-files" }; picker.FileTypeChoices.Add("ZIP", new[] { ".zip" }); InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(App.MainWindow));
            var file = await picker.PickSaveFileAsync(); if (file is not null) { await File.WriteAllBytesAsync(file.Path, data); Status.Message = $"Готово: {file.Name}"; Status.Severity = InfoBarSeverity.Success; Status.IsOpen = true; }
        }
        catch (Exception ex) { Error(ex.Message); }
    }
    private void Error(string text) { Status.Message = text; Status.Severity = InfoBarSeverity.Error; Status.IsOpen = true; }
}
