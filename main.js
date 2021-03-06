// Adapted from https://gist.github.com/magican/5574556
// by minrk https://github.com/minrk/ipython_extensions
// See the history of contributions in README.md

define([
  'require',
  'jquery',
  'base/js/namespace',
  'notebook/js/codecell',
  './sidebar_toc'
], function(
  require,
  $,
  IPython,
  codecell,
  sidebar_toc
) {
  "use strict";

  // imports
  var highlight_toc_item = sidebar_toc.highlight_toc_item;
  var table_of_contents = sidebar_toc.table_of_contents;
  var toggle_toc = sidebar_toc.toggle_toc;

// ...........Parameters configuration......................
  // default values for system-wide configurable parameters
  var cfg={'threshold':4,
    'navigate_menu':true,
    'moveMenuLeft': true,
    'widenNotebook': false,
    'colors': {
      'hover_highlight': '#DAA520',
      'selected_highlight': '#FFD700',
      'running_highlight': '#FF0000',
      'wrapper_background': '#FFFFFF',
      'sidebar_border': '#EEEEEE',
      'navigate_text': '#333333',
      'navigate_num': '#000000',
    },
    collapse_to_match_collapsible_headings: false,
  };
  // default values for per-notebook configurable parameters
  var metadata_settings = {
    nav_menu: {},
    number_sections: true,
    sideBar: true,
    skip_h1_title: false,
    toc_position: {},
    toc_section_display: 'block',
    toc_window_display: false,
    hide_others: true
  };
  // add per-notebook settings into global config object
  $.extend(true, cfg, metadata_settings);

//.....................global variables....
  var st={};
  st.oldTocHeight = undefined;
  st.toc_index=0;

  var read_config = function (cfg, callback) {
    IPython.notebook.config.loaded.then(function () {
      // config may be specified at system level or at document level.
      // first, update defaults with config loaded from server
      $.extend(true, cfg, IPython.notebook.config.data.sidebar_toc);
      // ensure notebook metadata has toc object, cache old values
      var md = IPython.notebook.metadata.toc || {};
      // reset notebook metadata to remove old values
      IPython.notebook.metadata.toc = {};
      // then update cfg with any found in current notebook metadata
      // and save in nb metadata (then can be modified per document)
      Object.keys(metadata_settings).forEach(function (key) {
        cfg[key] = IPython.notebook.metadata.toc[key] = (md.hasOwnProperty(key) ? md : cfg)[key];
      });
      // create highlights style section in document
      create_additional_css();
      // call callbacks
      callback && callback();
    });
    return cfg;
  };

  // extra download as html with toc menu (needs IPython kernel)
  function addSaveAsWithToc() {
    if (IPython.notebook.metadata.kernelspec.language == 'python') {
      if ($('#save_html_with_toc').length == 0) {
        $('#save_checkpoint').after("<li id='save_html_with_toc'/>")
        $('#save_html_with_toc')
          .append($('<a/>').text('Save as HTML (with toc)').attr("href", "#"))
          .on('click', function (evt) {
            if (IPython.notebook.metadata.kernelspec.language == 'python') {
              var code = "!jupyter nbconvert '" + IPython.notebook.notebook_name + "' --template sidebar_toc";
              console.log('[sidebar_toc] running:', code);
              IPython.notebook.kernel.execute(code);
            }
            else {
              alert('Sorry; this only works with a IPython kernel');
              $('#save_html_with_toc').remove();
            }
          });
      }
    }
    else {
      $('#save_html_with_toc').remove()
    }
  }



// **********************************************************************

//***********************************************************************
// ----------------------------------------------------------------------

  function toggleToc() {
    toggle_toc(cfg,st)
  }

  var toc_button = function () {
    if (!IPython.toolbar) {
      $([IPython.events]).on("app_initialized.NotebookApp", toc_button);
      return;
    }
    if ($("#toc_button").length === 0) {
      IPython.toolbar.add_buttons_group([
        {
          'label'   : 'Table of Contents',
          'icon'    : 'fa-list',
          'callback':  toggleToc,
          'id'      : 'toc_button'
        }
      ]);
    }
  };

  var load_css = function () {
    var link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = require.toUrl("./main.css");
    document.getElementsByTagName("head")[0].appendChild(link);
  };


  function create_additional_css() {
    var sheet = document.createElement('style')
    sheet.innerHTML = "#toc-level0 li > span:hover { background-color: " + cfg.colors.hover_highlight + " }\n" +
      ".toc-item-highlight-select  {background-color: " + cfg.colors.selected_highlight + "}\n" +
      ".toc-item-highlight-execute  {background-color: " + cfg.colors.running_highlight + "}\n" +
      ".toc-item-highlight-execute.toc-item-highlight-select   {background-color: " + cfg.colors.selected_highlight + "}"
    if (cfg.moveMenuLeft){
      sheet.innerHTML += "div#menubar-container, div#header-container {\n"+
        "width: auto;\n"+
        "padding-left: 20px; }"
    }
    // Using custom colors
    sheet.innerHTML += ".float-wrapper, .sidebar-wrapper { background-color: " + cfg.colors.wrapper_background + "}";
    sheet.innerHTML += "#toc-level0 a, #navigate_menu a, .toc { color: " + cfg.colors.navigate_text + "}";
    sheet.innerHTML += "#toc-wrapper .toc-item-num { color: " + cfg.colors.navigate_num + "}";
    sheet.innerHTML += ".sidebar-wrapper { border-color: " + cfg.colors.sidebar_border + "}";
    document.body.appendChild(sheet);
  }


  var CodeCell = codecell.CodeCell;

  function patch_CodeCell_get_callbacks() {

    var previous_get_callbacks = CodeCell.prototype.get_callbacks;
    CodeCell.prototype.get_callbacks = function() {
      var callbacks = previous_get_callbacks.apply(this, arguments);
      var prev_reply_callback = callbacks.shell.reply;
      callbacks.shell.reply = function(msg) {
        if (msg.msg_type === 'execute_reply') {
          setTimeout(function(){
            $('.toc .toc-item-highlight-execute').removeClass('toc-item-highlight-execute');
            rehighlight_running_cells() // re-highlight running cells
          }, 100);
          var c = IPython.notebook.get_selected_cell();
          highlight_toc_item({ type: 'selected' }, { cell: c })
        }
        return prev_reply_callback(msg);
      };
      return callbacks;
    };
  }

  function excute_codecell_callback(evt, data) {
    var cell = data.cell;
    highlight_toc_item(evt, data);
  }

  function rehighlight_running_cells() {
    $.each($('.running'), // re-highlight running cells
      function(idx, elt) {
        highlight_toc_item({ type: "execute" }, $(elt).data())
      }
    )
  }

  var toc_init = function() {
    // read configuration, then call toc
    cfg = read_config(cfg, function() { table_of_contents(cfg, st); }); // called after config is stable
    // event: render toc for each markdown cell modification
    $([IPython.events]).on("rendered.MarkdownCell",
      function(evt, data) {
        table_of_contents(cfg, st); // recompute the toc
        rehighlight_running_cells() // re-highlight running cells
        highlight_toc_item(evt, data); // and of course the one currently rendered
      });
    // event: on cell selection, highlight the corresponding item
    $([IPython.events]).on('select.Cell', highlight_toc_item)
    // event: if kernel_ready (kernel change/restart): add/remove a menu item
    $([IPython.events]).on("kernel_ready.Kernel", function() {
      addSaveAsWithToc();
    })

    // add a save as HTML with toc included
    addSaveAsWithToc();
    //
    // Highlight cell on execution
    patch_CodeCell_get_callbacks()
    $([Jupyter.events]).on('execute.CodeCell', excute_codecell_callback);
  }


  function patch_actions() {
    console.log('Sidebar: patching Jupyter up/down actions');

    var kbm = Jupyter.keyboard_manager;

    var action_up = kbm.actions.get(kbm.command_shortcuts.get_shortcut('up'));
    action_up.handler = function (env) {
      for (var index = env.notebook.get_selected_index() - 1; (index !== null) && (index >= 0); index--) {
        if (env.notebook.get_cell(index).element.is(':visible')) {
          env.notebook.select(index);
          env.notebook.focus_cell();
          return;
        }
      }
    };

    var action_down = kbm.actions.get(kbm.command_shortcuts.get_shortcut('down'));
    action_down.handler = function (env) {
      var ncells = env.notebook.ncells();
      for (var index = env.notebook.get_selected_index() + 1; (index !== null) && (index < ncells); index++) {
        if (env.notebook.get_cell(index).element.is(':visible')) {
          env.notebook.select(index);
          env.notebook.focus_cell();
          return;
        }
      }
    };

    var action_run_select_below = kbm.actions.get(kbm.command_shortcuts.get_shortcut('shift-enter'));
    action_run_select_below.handler = function (env) {
      var indices = env.notebook.get_selected_cells_indices();
      var cell_index;
      if (indices.length > 1) {
        env.notebook.execute_cells(indices);
        cell_index = Math.max.apply(Math, indices);
      } else {
        var cell = env.notebook.get_selected_cell();
        cell_index = env.notebook.find_cell_index(cell);
        cell.execute();
      }

      // If we are at the end always insert a new cell and return
      if (cell_index === (env.notebook.ncells()-1)) {
        env.notebook.command_mode();
        env.notebook.insert_cell_below();
        env.notebook.select(cell_index+1);
        env.notebook.edit_mode();
        env.notebook.scroll_to_bottom();
        env.notebook.set_dirty(true);
        return;
      }

      env.notebook.command_mode();
      if (env.notebook.get_cell(cell_index+1).element.is(':visible')) {
        env.notebook.select(cell_index + 1);
      } else {
        env.notebook.insert_cell_below();
        env.notebook.select(cell_index + 1);
        env.notebook.edit_mode();

      }
      env.notebook.focus_cell();
      env.notebook.set_dirty(true);
    };

    Jupyter.notebook.events.off('delete.Cell');
  }

  var load_ipython_extension = function() {
    load_css(); //console.log("Loading css")
    toc_button(); //console.log("Adding toc_button")

    // Wait for the notebook to be fully loaded
    if (Jupyter.notebook !== undefined && Jupyter.notebook._fully_loaded) {
      // this tests if the notebook is fully loaded
      console.log("[sidebar_toc] Notebook fully loaded -- sidebar_toc initialized ")
      toc_init();
      patch_actions();
    } else {
      console.log("[sidebar_toc] Waiting for notebook availability")
      $([Jupyter.events]).on("notebook_loaded.Notebook", function() {
        console.log("[sidebar_toc] sidebar_toc initialized (via notebook_loaded)")
        toc_init();
        patch_actions();
      })
    }

  };


  return {
    load_ipython_extension : load_ipython_extension,
    toggle_toc : toggle_toc,
    table_of_contents : table_of_contents
  };

});
