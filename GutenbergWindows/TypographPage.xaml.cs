using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;

namespace GutenbergWindows;
public sealed partial class TypographPage : Page
{
    public TypographPage() => InitializeComponent();
    private async void Process_Click(object sender, RoutedEventArgs e)
    {
        var enabled = new List<string>(); if (Quotes.IsChecked == true) enabled.Add("quotes"); if (Dashes.IsChecked == true) enabled.Add("dashes"); if (Spaces.IsChecked == true) enabled.Add("nbsp");
        try { using var doc = await Api.JsonAsync("typograph/api/correct", new { text = Source.Text, enabled_types = enabled, en_dash_style = British.IsChecked == true ? "uk" : "us", default_lang = "auto", exceptions = Array.Empty<string>() }); Result.Text = doc.RootElement.GetProperty("result").GetString() ?? ""; }
        catch (Exception ex) { Status.Message = ex.Message; Status.Severity = InfoBarSeverity.Error; Status.IsOpen = true; }
    }
    private void Copy_Click(object sender, RoutedEventArgs e) { var package = new DataPackage(); package.SetText(Result.Text); Clipboard.SetContent(package); }
}
