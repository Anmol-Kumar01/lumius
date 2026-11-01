// Applied once by Plasma. A recovery panel can be added from the desktop context menu.
var ps = panels();
for (var i = 0; i < ps.length; i++) { ps[i].remove(); }
var ds = desktops();
for (var j = 0; j < ds.length; j++) {
 ds[j].wallpaperPlugin = 'org.kde.image';
 ds[j].currentConfigGroup = ['Wallpaper', 'org.kde.image', 'General'];
 ds[j].writeConfig('Image', 'file:///usr/share/wallpapers/lumius/aurora.svg');
}
