using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace GutenbergWindows;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1180, 760));
        Navigation.SelectedItem = Navigation.MenuItems[0];
        RootFrame.Navigate(typeof(SpellcheckPage));
        Navigation.Loaded += async (_, _) => await StartBackendAsync();
        Closed += (_, _) => BackendManager.Shared.Dispose();
    }

    private async Task StartBackendAsync()
    {
        BackendInfo.Message = "Запуск встроенных модулей…";
        try
        {
            await BackendManager.Shared.StartAsync();
            BackendInfo.IsOpen = false;
        }
        catch (Exception ex)
        {
            BackendInfo.Severity = InfoBarSeverity.Error;
            BackendInfo.Message = ex.Message;
        }
    }

    private void Navigation_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        var page = (args.SelectedItemContainer?.Tag?.ToString()) switch
        {
            "typograph" => typeof(TypographPage),
            "converter" => typeof(ConverterPage),
            "layouts" => typeof(LayoutsPage),
            _ => typeof(SpellcheckPage)
        };
        if (RootFrame.CurrentSourcePageType != page) RootFrame.Navigate(page);
    }
}
