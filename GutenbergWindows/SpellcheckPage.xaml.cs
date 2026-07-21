using System.Collections.ObjectModel;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace GutenbergWindows;
public sealed partial class SpellcheckPage : Page
{
    private readonly ObservableCollection<Issue> items = [];
    public SpellcheckPage() { InitializeComponent(); Issues.ItemsSource = items; Source.TextChanged += (_, _) => Count.Text = $"{Source.Text.Length} знаков"; Count.Text = $"{Source.Text.Length} знаков"; Issues.ItemClick += ApplyIssue; Issues.IsItemClickEnabled = true; }
    private async void Check_Click(object sender, RoutedEventArgs e) => await CheckAsync();
    private async Task CheckAsync()
    {
        Status.IsOpen = false;
        try
        {
            var language = ((ComboBoxItem)Language.SelectedItem).Tag.ToString();
            using var doc = await Api.JsonAsync("spellcheck/api/check", new { text = Source.Text, language, enableStyle = Style.IsChecked == true });
            items.Clear();
            foreach (var m in doc.RootElement.GetProperty("matches").EnumerateArray())
            {
                var offset = m.GetProperty("offset").GetInt32(); var length = m.GetProperty("length").GetInt32();
                var replacements = m.GetProperty("replacements").EnumerateArray().Select(x => x.GetString() ?? "").Take(5).ToArray();
                items.Add(new(offset, length, SafeFragment(Source.Text, offset, length), m.GetProperty("message").GetString() ?? "", replacements));
            }
            IssuesTitle.Text = $"Замечания · {items.Count}";
        }
        catch (Exception ex) { ShowError(ex.Message); }
    }
    private async void ApplyIssue(object sender, ItemClickEventArgs e)
    {
        var issue = (Issue)e.ClickedItem; if (issue.Replacements.Length == 0) return;
        Source.Text = Source.Text.Remove(issue.Offset, issue.Length).Insert(issue.Offset, issue.Replacements[0]); await CheckAsync();
    }
    private async void Dictionary_Click(object sender, RoutedEventArgs e)
    {
        var input = new TextBox { PlaceholderText = "Слово-исключение" };
        var dialog = new ContentDialog { XamlRoot = XamlRoot, Title = "Пользовательский словарь", Content = input, PrimaryButtonText = "Добавить", CloseButtonText = "Закрыть" };
        if (await dialog.ShowAsync() == ContentDialogResult.Primary && !string.IsNullOrWhiteSpace(input.Text)) await Api.JsonAsync("spellcheck/api/dictionary", new { word = input.Text.Trim() });
    }
    private void ShowError(string value) { Status.Message = value; Status.Severity = InfoBarSeverity.Error; Status.IsOpen = true; }
    private static string SafeFragment(string s, int start, int length) => start >= 0 && start + length <= s.Length ? s.Substring(start, length) : "Фрагмент";
    private sealed record Issue(int Offset, int Length, string Fragment, string Message, string[] Replacements);
}
