"""Keep an isolated GUI test session awake; not installed into the OS image."""
import time
import dbus

bus = dbus.SessionBus()
screen = bus.get_object('org.freedesktop.ScreenSaver', '/ScreenSaver')
screen.Inhibit('Lumius QA', 'Automated desktop validation', dbus_interface='org.freedesktop.ScreenSaver')
time.sleep(3600)
