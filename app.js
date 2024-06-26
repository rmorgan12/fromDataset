// DDX Bricks Wiki - See https://developer.domo.com/docs/ddx-bricks/getting-started-using-ddx-bricks
// for tips on getting started, linking to Domo data and debugging your app
 
/* Step 1. Select your data from the link in the bottom left corner */


/* Step 2. Define your data object to be stored in the database and collected by the form.

  Use the following JSON structure:

    {
      id: <key>
      label: <label> 
      type: <type>
    },

  Where:

    <key> is the unique ID for the field, to be used in the database (use only letters or underscore character)
    <label> is the display label for the field (what the person sees)
    <type> is the type of value to be collected (this code supports 'text' or 'number')
*/
var dataObject = [
  {
    id: 'first_name',
    label: 'First Name',
    type: 'text',
  },
  {
    id: 'last_name',
    label: 'Last Name',
    type: 'text',
  },
  {
    id: 'age',
    label: 'Age',
    type: 'number',
  }
];
var addButtonLabel = 'Add Person';
var exportButtonLabel = 'Export as CSV';
var actionColumnTitle = 'Actions';

// Set "syncToDataset" to true if you would like the data to be synced to a domo dataset
// Note: If set to true any changes made to the dataObject above will affect
// your datasets columns and any cards using that data. Try to only turn on syncing
// when your dataObject is not going to be experiencing frequent changes.
var syncToDataset = false;


//---------------------------------------------------
// For ultimate flexibility, modify the code below!
//---------------------------------------------------

//Available globals
var domo = window.domo; // For more on domo.js: https://developer.domo.com/docs/dev-studio-guides/domo-js#domo.get
var datasets = window.datasets;
var $ = window.jQuery;
var myDiv = document.getElementById('myDiv');

// Setup collection service
var collectionName = 'form_data';
var collectionService = new CollectionService(collectionName, dataObject, syncToDataset);

// Link JavasScript to the HTML elements
var modalEl = document.getElementById('myModal');
var myModal = new FormModal(modalEl, dataObject, {
  addTitle: 'Add Person',
  editTitle: 'Edit Person',
  onSubmit: function(){ tableList.showLoading() },
  afterSubmit: function(res){ tableList.load() },
  onClear: function() { tableList.clear() },
});

var table = document.getElementById('tableList');
var tableList = new TableList(table, dataObject, collectionService, {
  onEdit: function(doc){ myModal.edit(doc) },
});

var searchContainer = document.getElementById('searchContainer');
var searchBox = new Search(searchContainer, collectionService, {
  onSearch: function(res){ tableList.build(res) },
});

var addButton = document.getElementById('addButton');
addButton.innerText = addButtonLabel;
addButton.onclick = myModal.show;

var exportButton = document.getElementById('exportButton');
exportButton.innerText = exportButtonLabel;
exportButton.onclick = function(){
  ExportData(dataObject, collectionService);
}
var syncButton = document.getElementById('syncButton');
syncButton.innerText = 'Sync Now';
syncButton.onclick = function(){
  collectionService.runSync();
}
isViewerTheOwner().then(function(showButton){
  if(showButton){
    exportButton.style.display = 'inline-block';
    if(syncToDataset) syncButton.style.display = 'inline-block';
    table.classList.add('isOwner');
  }
});

$(document).ready(function(){
  tableList.load();
});


function isViewerTheOwner() {
  return Promise.all([
    collectionService.getCollectionInfo(),
    domo.get('/domo/environment/v1'),
  ]).then(function([info, env]){
    return (
      info &&
      info.owner &&
      env &&
      isFinite(env.userId) &&
      Number(env.userId) === info.owner
    );
  });
}


////////  Table List  ///////////////////////////////

function TableList(tableEl, dataObj, collectionService, opts){
  var $table, dataKeys;

  function constructor(){
    $table = $(tableEl);
    dataKeys = dataObj.map(function(col){ return col.id });
    buildTableStructure();
  }

  function showLoading(flag = true){
    if(flag){
      $table.addClass('loading');
      return;
    }

    $table.removeClass('loading');
    return;
  }

  function buildTableStructure(){
    $table.append('<thead><tr></tr></thead><tbody></tbody>');
    var $headerRow = $table.find('thead tr');
    dataObj.forEach(function(column) {
      $headerRow.append(`
        <th scope="col">
          ${column.label} <span class="data-type">(${column.type})</span>
        </th>
      `);
    });

    $headerRow.append(`<th class="actions" scope="col">${actionColumnTitle}</th>`)
  }

  function buildTableBody(docs){
    $table.find('tbody').empty();
    docs.forEach(function(doc){ addRow(doc) });
    showLoading(false);
  }

  function loadTable(){
    collectionService.getAll().then(buildTableBody);
  }

  function addRow(document){
    var $row = $('<tr></tr>');
    $row.data('id', document.id);

    var data = document.content;
    dataKeys.forEach(function(key) {
      var value = (data[key] !== undefined)? makeSafeText(data[key]) : `<em>undefined</em>`;
      $row.append(`<td>${value}</td>`);
    });

    var $actions = $('<td></td>').addClass('actions').appendTo($row);
    var $remove = $(`
      <button class="btn btn-light remove-btn" title="Remove">
        <i class="bi bi-trash"></i>
      </button>
    `).appendTo($actions);
    var $edit = $(`
      <button class="btn btn-light edit-btn" title="Edit">
        <i class="bi bi-pencil"></i>
      </button>
    `).appendTo($actions);

    $remove.on('click', function(ev){ remove(document.id, ev) });
    $edit.on('click', function(ev){ edit(document.id, ev) });

    $table.find('tbody').append($row);
  }

  function remove(id, ev){
    $(ev.target).closest('tr').hide();
    collectionService.remove(id);
  }

  function edit(id, ev){
    clearEdit();
    $(ev.target).closest('tr').addClass('editing');
    var doc = collectionService.getFromCache(id);
    opts.onEdit && opts.onEdit(doc);
  }

  function clearEdit(){
    $table.find('.editing').removeClass('editing');
  }

  constructor()
  return {
    clear: clearEdit,
    load: loadTable,
    build: buildTableBody,
    showLoading: showLoading,
  };
}



////////  Search Input  ////////////////////////////

function Search(containerEl, collectionService, opts){
  var searchDelay = 300;
  var searchTimer = null;
  var $searchField, $clearBtn;

  function constructor(){
    $searchField = $(containerEl).find('input');
    $clearBtn = $(containerEl).find('button');

    $searchField.on('keyup', onKeyUp);
    $clearBtn.on('click', clearSearch);
  }

  function onKeyUp(ev){
    var value = makeSafeText(ev.target.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function(){
      search(value);
    }, searchDelay)
  }

  function search(value){
    clearTimeout(searchTimer);
    if(typeof opts.onSearch === 'function'){
      var res = collectionService.searchCache(value);
      opts.onSearch(res);
    }
  }

  function clearSearch(){
    $searchField.val('').focus();
    search('');
  }

  constructor();
  return {
    clear: clearSearch,
    search: search,
  };
}



////////  Form Modal  ///////////////////////////////

function FormModal(modalEl, dataObj, opts){
  var $modal, modal, $form;

  function constructor(){
    $modal = $(modalEl);
    buildForm(dataObj);

    modal = new bootstrap.Modal(modalEl);
    $form = $modal.find('form');
    $title = $modal.find('.modal-title');

    $form.on('submit', submit);
    $modal.on('hidden.bs.modal', clear);
  }

  function edit(doc){
    var form = $form[0];
    doc && Object.keys(doc.content).forEach(key => 
      form[key] && (form[key].value = decodeSafeText(doc.content[key]))
    )
    form['id'].value = doc.id;
    
    show(opts.editTitle || 'Edit');
  }

  function buildForm(dataObj){
    var $body = $modal.find('.modal-body');
    $body.append('<input type="hidden" name="id">');
    dataObj.forEach(function(column) {
      var key = column.id;
      var type = (column.type === 'string')? 'text' : column.type;
      var label = column.label;
      $body.append(`
        <div class="mb-3 row">
          <label class="col-sm-4 col-form-label" for="${key}">
            ${label} <span class="field-type">(${type})</span>
          </label>
          <div class="col-sm-8">
            <input class="form-control" id="${key}" name="${key}" step="any" type="${type}">
          </div>
        </div>
      `);
    })
  }
  
  function submit(){
    opts.onSubmit && opts.onSubmit();
    modal.hide();
    var person = formToJson(this);
  
    if(person.id == null || person.id == ''){
      collectionService.add(person).then(res => 
        opts.afterSubmit && opts.afterSubmit(res)
      );
    }
    else{
      var id = person.id;
      person.id = undefined;
      collectionService.update(id, person).then(res => 
        opts.afterSubmit && opts.afterSubmit(res)
      );
    }
    
    clear();
  }

  function show(str){
    var title = (typeof str === 'string')? str : (opts.addTitle || 'Add');
    $title.text(title);
    modal.show();
  }
  
  function clear(){
    opts.onClear && opts.onClear();
    $form[0].reset();
    $form[0]['id'].value = '';
  }
  
  function formToJson(form){
    var pairs = $(form).serializeArray();
    var obj = {};
    $.each(pairs, function() {
      var key = this.name;
      var value = this.value;
      if (obj[key]) {
        if (!obj[key].push) {
          obj[key] = [obj[key]];
        }
        obj[key].push(value || '');
      } else {
        obj[key] = value || '';
      }
    });
    var data = {id: obj.id};
    dataObject.forEach(function(col){
      var k = col.id;
      if(obj[k]) {
        data[k] = (obj[k] !== "" && col.type === 'number') ? parseFloat(obj[k]) : makeSafeText(obj[k]);
      }
    });
    return data;
  }

  constructor();
  return {
    edit: edit,
    clear: clear,
    submit: submit,
    show: show,
    hide: modal.hide,
  }
}


////////  Export  ///////////////////////////////////

// Function to export data to a CSV file
function ExportData(dataObj, collectionService, delimiter, enclosure){
  // Set default values for delimiter and enclosure if not provided
  delimiter = delimiter || ',';
  enclosure = enclosure || '"';
  // Extract keys from the data objects
  var dataKeys = dataObj.map(function(p){ return p.id; });

  // Retrieve all documents using the provided collection service
  collectionService.getAll().then(function(docs){
    // Generate CSV content
    var result = runExport(docs);
    // Create a new anchor element
    let a = document.createElement('a');
    // Set the href attribute to a Data URL containing the CSV content
    a.href = "data:application/octet-stream," + encodeURIComponent(result);
    // Define the file name for the downloaded CSV
    const fileName = encodeURIComponent('Export') + '.csv';
    // Set the download attribute to trigger download
    a.download = fileName;
    // Simulate a click on the anchor element to initiate download
    a.click();
  });

  // Function to process documents and generate CSV content
  function runExport(docs){
    var exportResult = [];
    // Generate CSV headers
    var headers = dataObj.map(function(col){
      return col.label || col.id;
    });
    exportResult.push(headers);

    // Iterate through each document and generate CSV rows
    docs.forEach(function(doc){
      exportResult.push(getRow(doc));
    });

    // Convert array of arrays to CSV format
    return arrayToCSV(exportResult);
  }

  // Function to extract data from a document and apply necessary formatting
  function getRow(document){
    var data = document.content;
    // Map document data to keys and apply necessary formatting
    return dataKeys && dataKeys.map(key => {
      return data[key] != null ? decodeSafeText(data[key]) : '';
    });
  }

  // Function to convert array of arrays to CSV format
  function arrayToCSV(data) {
    var rows = data && data.map(function(row){
      // Convert each row to CSV format using the specified delimiter
      return row && row.map(function(col){
        return escapeCol(col);
      }).join(delimiter);
    });

    // Join rows with line breaks to form complete CSV content
    return rows.join("\r\n");
  }

  // Function to escape column values for CSV format
  function escapeCol(col) {
    // Check if the value is not boolean or numeric
    if(isNaN(col)) {
      // If null or undefined, replace with an empty string
      if (col == null) {
        col = '';
      }
      else {
        // If string or object, apply necessary escaping
        col = String(col);
        if (col.length > 0) {
          // Escape any inline enclosure characters
          col = col.split( enclosure ).join( enclosure + enclosure );
          // Wrap the value with enclosure characters
          col = enclosure + col + enclosure;
        }
      }
    }
    return col;
  }
}




////////  Collection Service  ///////////////////////

/** Learn more about AppDB collections: https://developer.domo.com/docs/dev-studio-references/appdb */
function CollectionService(collection, columnsObject, syncToDataset){
  var collectionName = collection;
  var collectionInfoPromise = null;
  var cache = null;

  // Setup schema if needed
  syncSchema(columnsObject);
  function syncSchema(columns){
    var requestedSchema = cleanUpSchema(columnsObjectToSchema(columns));
    return getCollectionInfo().then(function(info){
      var currentColumns = info && info.schema && info.schema.columns;
      var requestedColumns = requestedSchema && requestedSchema.columns;
      var schemaIsSame = (
        info.syncEnabled === syncToDataset && (
          currentColumns && requestedColumns &&
          currentColumns.length && requestedColumns.length && currentColumns.length === requestedColumns.length &&
          !requestedColumns.some(function(column){
            var index = currentColumns.findIndex(function(col){ return col.name === column.name; });
            return index === -1 || column.type !== currentColumns[index].type;
          })
        )
      );
      if(!schemaIsSame){
        return updateCollection(requestedSchema, syncToDataset);
      }
      return schemaIsSame;
    })
  }

  function columnsObjectToSchema(obj) {
    return {
      columns: obj.map(function(column){
        return {
          type: getColumnType(column.type),
          name: column.id,
          visible: true,
        }
      })
    };
  }

  function getColumnType(type){
    switch(type.toUpperCase && type.toUpperCase()){
      case 'TEXT':
        return 'STRING';
      case 'NUMBER':
        return 'DOUBLE';
      case 'STRING':
      case 'LONG':
      case 'DECIMAL':
      case 'DOUBLE':
      case 'DATE':
      case 'DATETIME':
        return type.toUpperCase();
      default:
        return 'STRING';
    }
  };

  function search(query){
    // Learn how to query: https://developer.domo.com/docs/dev-studio-references/appdb#Query%20Documents
    return domo.post(`/domo/datastores/v1/collections/${collectionName}/documents/query`, query);
  }

  function searchCache(value){
    return cache.filter(doc => 
      doc.content && Object.keys(doc.content).some(key =>
        doc.content[key].toString().toLowerCase().indexOf(value.toLowerCase()) >= 0
      )
    )
  }

  function getCollectionInfo(){
    if(collectionInfoPromise == null){
      collectionInfoPromise = domo.get(`/domo/datastores/v1/collections/${collectionName}`)
    }
    return collectionInfoPromise;
  }

  function updateCollection(schema, syncEnabled){
    return getCollectionInfo().then(function(info) {
      return domo.put(`/domo/datastores/v1/collections/${collectionName}`, {
        schema: cleanUpSchema(schema),
        syncEnabled: syncEnabled != null ? syncEnabled : info.syncEnabled,
      });
    });
  }

  function cleanUpSchema(schema) {
    return Object.assign({}, schema, {
      columns: schema.columns && schema.columns.map(col => ({
        name: col.name || col.label,
        type: getColumnType(col.type),
      }))
    });
  }

  function runSync(){
    var Status = {
      STARTED: 200,
      IN_PROGRESS: 423,
    }
    return domo.post(`/domo/datastores/v1/export`)
      .then(res => {
        res.status === Status.STARTED || res.status === Status.IN_PROGRESS
      });
  }
  
  function getAll(){
    return domo.get(`/domo/datastores/v1/collections/${collectionName}/documents`)
      .then(res => cache = res);
  }

  function get(documentId){
    return domo.get(`/domo/datastores/v1/collections/${collectionName}/documents/${documentId}`);
  }

  function getFromCache(documentId){
    return cache.find(doc => doc.id === documentId);
  }

  function update(documentId, content){
    return domo.put(`/domo/datastores/v1/collections/${collectionName}/documents/${documentId}`, { content: content })
      .then(res => {
        var index = cache.findIndex(doc => doc.id === documentId);
        cache.splice(index, 1, res);
        return res;
      });
  }

  function add(content){
    return domo.post(`/domo/datastores/v1/collections/${collectionName}/documents/`, { content: content })
      .then(res => {
        cache.push(res);
        return res;
      });
  }

  function remove(documentId){
    return domo.delete(`/domo/datastores/v1/collections/${collectionName}/documents/${documentId}`).then(res => {
      var index = cache.findIndex(doc => doc.id === documentId);
      cache.splice(index, 1);
    });
  }

  return {
    add: add,
    get: get,
    getAll: getAll,
    getCollectionInfo: getCollectionInfo,
    updateCollection: updateCollection,
    getFromCache: getFromCache,
    remove: remove,
    runSync: runSync,
    search: search,
    searchCache: searchCache,
    update: update,
  };
}

// Create a safe version of an input value to be stored to the database
// Transforms: "<h1>test</h1>"  =>  "&lt;h1&gt;test&lt;/h1&gt;"
function makeSafeText(text){
  return String(text)
    .replace(/&[/s]+/g, '&amp; ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Decode the text before displaying as an input value
// Example: "&lt;h1&gt;test&lt;/h1&gt;"  =>  "<h1>test</h1>"
function decodeSafeText(text){
  var div = document.createElement('div');
  div.innerHTML = makeSafeText(text);
  return div.innerText;
}
