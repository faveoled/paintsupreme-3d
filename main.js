const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const nativeImage = electron.nativeImage;
const protocol = electron.protocol;

const path = require('path');
const url = require('url');
const fs = require('fs');

let mainWindows = [];
let appQuit = false;
let openFile, appIsReady;
let dataStore = {};

app.commandLine.appendSwitch('--enable-npapi');
app.commandLine.appendSwitch('--enable-pointer-events');

function fileExists(filePath)
{
    try {
        return fs.statSync(filePath).isFile();
    }
    catch (err) {
        return false;
    }
}

function createWindow () {
    // let mainWindow = new BrowserWindow( { width: 1600, height: 900, show : false, 'web-preferences': { 'plugins': true } } );
    let mainWindow = new BrowserWindow( { width: 1440, height: 900, show : false, 'web-preferences': { 'plugins': true } } );
    mainWindows.push( mainWindow );

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'paintsupreme.html'),
        protocol: 'file:',
        slashes: true,
        icon: nativeImage.createFromPath( __dirname + '/icon.png' ),
    }));

    let splashWindow = new BrowserWindow( { width: 1200, height: 900, frame: false, transparent : true } );
    splashWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'splash.html'),
        protocol: 'file:',
        slashes: true
    }));

    splashWindow.setAlwaysOnTop(true);

    const ipc = require('electron').ipcMain;
    ipc.once('app-initialized', function ( e ) {
        setTimeout( () => {
            mainWindow.show();
            if ( openFile ) {
                if ( fileExists( openFile ) )                
                    mainWindow.send( 'open-project', openFile );
                openFile = undefined;
            } else
            if ( process.platform == 'win32' && process.argv.length >= 2) {
                if ( fileExists( process.argv[1] ) )
                    mainWindow.send( 'open-project', process.argv[1] );
            }

        }, 1500 );
        setTimeout( () => splashWindow.close(), 2000 );
    });

    mainWindow.on('close', function ( e ) {
        // if ( mainWindow.isDocumentEdited() )
        if ( dataStore[mainWindow.id] )
        {
            e.preventDefault();

            dialog.showMessageBox( {
                type: 'question',
                buttons: ['Yes', 'No'],
                title: 'Confirm',
                message: 'Unsaved data will be lost. Are you sure you want to quit?'
            }, function (response) {
                if (response === 0) {
                    mainWindow.setDocumentEdited( false );
                    dataStore[mainWindow.id] = false;
                    mainWindow.close();
                    if ( appQuit ) app.quit();
                }
            } );
        }
    });

    mainWindow.on('closed', function ( e ) {
        let index = mainWindows.indexOf( mainWindow );
        if ( index > -1 ) mainWindows.splice( index, 1 );
    });

    return mainWindow;
}

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    if ( process.platform !== 'darwin' )
        app.quit();
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if ( !mainWindows.length ) {
        createWindow();
    }
});

// --- Load Project Dialog

const ipc = require('electron').ipcMain;
const dialog = require('electron').dialog;

ipc.on('open-file-dialog', function (event) {
    const window = BrowserWindow.fromWebContents(event.sender);
    dialog.showOpenDialog( window, { properties: ['openFile' ] },
    function (files) {
        if ( files ) event.sender.send( 'selected-project-file', files );
    } );
});

// --- Save Dialogs

ipc.on('save-project-dialog', function (event) {
    const window = BrowserWindow.fromWebContents(event.sender);

    const options = {
        title: 'Save Project',
        filters: [ { name: 'PaintSupreme 3D', extensions: ['paintsupreme'] } ]
    };

    dialog.showSaveDialog( window, options,
    function ( fileName ) {
        event.sender.send( 'save-project-file', fileName );
    } );
});

ipc.on('save-image-dialog', function (event, params) {
    const window = BrowserWindow.fromWebContents(event.sender);

    const options = {
        title: 'Save Image',
        filters: params.filters
    };

    dialog.showSaveDialog( window, options,
    function ( fileName ) {
        params.filename = fileName;
        event.sender.send( 'save-image-file', params );
    } );
});

// --- Document State Changed

ipc.on('document-state-change', function ( e, param ) {
    dataStore[param.id] = param.state;
});

// --- Menu

const Menu = electron.Menu;

let template = [
    {
        label: 'File',
        submenu: [
            { label: 'Open...', accelerator: 'CmdOrCtrl+O', click : ( event, fWindow ) => fWindow.webContents.send( 'workspace-open' ) },
            { type: 'separator' },
            { label: 'Save', accelerator: 'CmdOrCtrl+S', click : ( event, fWindow ) => fWindow.webContents.send( 'workspace-save' ) },
            { label: 'Save As...', accelerator: 'Shift+CmdOrCtrl+S', click : ( event, fWindow ) => fWindow.webContents.send( 'workspace-saveas' ) },
            { type: 'separator' },
            { label: 'Import...', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-import' ) },
            { label: 'Export...', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-export' ) },
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { label: 'Undo', accelerator: 'CmdOrCtrl+Z', enabled : false, click : ( event, fWindow ) => fWindow.webContents.send( 'workspace-undo' ) },
            { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', enabled : false, click : ( event, fWindow ) => fWindow.webContents.send( 'workspace-redo' ) },
            { type: 'separator' },
            { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
            { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
            { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        ]
    },
    {
        label: 'Layer',
        submenu: [
            { label: 'Add Layer', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-addlayer' ) },
            { label: 'Add Light', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-addlight' ) },
            { label: 'Delete Layer(s)', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-deletelayer' ) },
            { type: 'separator' },
            { label: 'Duplicate Layer', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-duplicatelayer' ) },
            { label: 'Merge Layers', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-mergelayers' ) },
        ]
    },
    {
        label: 'Selection',
        submenu: [
            { label: 'Clear Selection', accelerator: 'CmdOrCtrl+D', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-clear-selection' ) },
            { label: 'Inverse Selection', accelerator: 'CmdOrCtrl+I', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-inverse-selection' ) },
            { label: 'Delete Contents', accelerator: 'Delete', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-delete-selection' ) },
            { type: 'separator' },
            { label: 'Select All', accelerator: 'CmdOrCtrl+A', click : ( event, fWindow ) => fWindow.webContents.send( 'ps-selectall' ) },
        ]
    },
    {
        label: 'View',
        submenu: [
            { label: 'Toggle Full Screen', accelerator: (function () {
                    if (process.platform === 'darwin') {
                        return 'Ctrl+Command+F';
                    } else {
                        return 'F11';
                    }
                })(),
                click: function (item, focusedWindow) {
                    if (focusedWindow)
                        focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                }
            },
            { label: 'Toggle Paint Mode', accelerator: 'Tab',
                click: function (item, focusedWindow) {
                    focusedWindow.webContents.send( 'ps-paintmode' );
                }
            },
            /*
            { label: 'Toggle Developer Tools', accelerator: (function () {
                    if (process.platform === 'darwin') {
                        return 'Alt+Command+I';
                    } else {
                        return 'Ctrl+Shift+I';
                    }
                })(),
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        focusedWindow.toggleDevTools();
                    }
                }
            },*/
            { type: 'separator' },
            { label: 'Zoom To Fit Canvas', accelerator: 'CmdOrCtrl+F',
            click: function (item, focusedWindow) {
                    focusedWindow.webContents.send( 'ps-zoomtofit' );
                }
            },
            { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus',
                click: function (item, focusedWindow) {
                    focusedWindow.webContents.send( 'ps-zoomin' );
                }
            },
            { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-',
                click: function (item, focusedWindow) {
                    focusedWindow.webContents.send( 'ps-zoomout' );
                }
            },
        ]
    }, {
        label: 'Window',
        role: 'window',
        submenu: [
            { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize'},
            // { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
            // { type: 'separator' },
            // { label: 'Reopen Window', accelerator: 'CmdOrCtrl+Shift+T', enabled: false, key: 'reopenMenuItem', click: function () { app.emit('activate'); } },
        ]
    }, {
        label: 'Help',
        role: 'help',
        submenu: [{
            label: 'Documentation',
            click: function ( event, fWindow ) {
                fWindow.webContents.send( 'app-help' );
            }
        }]
}];

function addUpdateMenuItems (items, position) {
  if (process.mas) return;

  const version = electron.app.getVersion();
  let updateItems = [{
    label: `Version ${version}`,
    enabled: false
  }, {
    label: 'Checking for Update',
    enabled: false,
    key: 'checkingForUpdate'
  }, {
    label: 'Check for Update',
    visible: false,
    key: 'checkForUpdate',
    click: function () {
      require('electron').autoUpdater.checkForUpdates();
    }
  }, {
    label: 'Restart and Install Update',
    enabled: true,
    visible: false,
    key: 'restartToUpdate',
    click: function () {
      require('electron').autoUpdater.quitAndInstall();
    }
  }];

  items.splice.apply(items, [position, 0].concat(updateItems));
}

function findReopenMenuItem () {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  let reopenMenuItem;
  menu.items.forEach(function (item) {
    if (item.submenu) {
      item.submenu.items.forEach(function (item) {
        if (item.key === 'reopenMenuItem') {
          reopenMenuItem = item;
        }
      });
    }
  });
  return reopenMenuItem;
}

if (process.platform === 'darwin') {
  const name = electron.app.getName();
  template.unshift({
    label: name,
    submenu: [{
      label: `About ${name}`,
      role: 'about'
    }, {
      type: 'separator'
    }, {
      label: 'Services',
      role: 'services',
      submenu: []
    }, {
      type: 'separator'
    }, {
      label: `Hide ${name}`,
      accelerator: 'Command+H',
      role: 'hide'
    }, {
      label: 'Hide Others',
      accelerator: 'Command+Alt+H',
      role: 'hideothers'
    }, {
      label: 'Show All',
      role: 'unhide'
    }, {
      type: 'separator'
    }, {
      label: 'Quit',
      accelerator: 'Command+Q',
      click: function () {
        appQuit = true;
        app.quit();
      }
    }]
  });

  // Window menu.
  template[6].submenu.push({
    type: 'separator'
  }, {
    label: 'Bring All to Front',
    role: 'front'
  });

  //addUpdateMenuItems(template[0].submenu, 1);
}

if (process.platform === 'win32') {
  const helpMenu = template[template.length - 1].submenu;
  //addUpdateMenuItems(helpMenu, 0);
}

app.on('browser-window-created', function () {
  let reopenMenuItem = findReopenMenuItem();
  if (reopenMenuItem) reopenMenuItem.enabled = false;
});

app.on('window-all-closed', function () {
  let reopenMenuItem = findReopenMenuItem();
  if (reopenMenuItem) reopenMenuItem.enabled = true;
});

if (process.platform === 'darwin') {
    // --- Insert New Window Command on Mac OS X
    template[1].submenu.splice( 0, 0, {
        label: 'New Window',
        click : ( event, fWindow ) => createWindow()
    } );

    template[1].submenu.splice( 1, 0, {
        type: 'separator'
    } );
}

// --- Mac OS X only, open the given file.

app.on ('open-file', function( event, path ) {

    // --- If app is not ready yet, no need to open a new window
    if ( appIsReady )
        createWindow();

    openFile = path;
    event.preventDefault();
});

// --- Ready

app.on('ready', function () {

    createWindow();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    appIsReady = true;
});