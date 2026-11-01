import QtQuick 2.0
import calamares.slideshow 1.0
Presentation {
    Slide {
        Rectangle {
            anchors.fill: parent
            color: '#edf4fa'
            Column {
                anchors.centerIn: parent
                spacing: 18
                Image { source: 'lumius.svg'; width: 100; height: 100; anchors.horizontalCenter: parent.horizontalCenter }
                Text { text: 'A space for everything.'; font.pixelSize: 30; color: '#2a4161'; anchors.horizontalCenter: parent.horizontalCenter }
                Text { text: 'Lumius is being installed on your computer.\nBuilt on Debian. Made to feel like home.'; font.pixelSize: 15; color: '#71849f'; horizontalAlignment: Text.AlignHCenter; anchors.horizontalCenter: parent.horizontalCenter }
            }
        }
    }
}
