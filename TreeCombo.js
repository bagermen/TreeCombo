/**
 * Ext.ux.form.TreeCombo
 *
 * Inspired by ComboBox.
 *
 * Parameters:
 *  directFn: Server direct function which loades nodes
 *  displayFullName: bool
 *  fullNameSeparator: string,
 *  treeCfg: {} - internal TreePanel parameters
 *  loaderParams: {foo: 'bar'} - parameters for sending to server. !!! IMPORTANT: Following parameters shouldn't be overriden
 *    - node - node Id required by TreePanel.
 *    - current - this parameter equals true when setValue(nodeId) is called and server should return info for quried nodeId. If current equals false then server search children info for queried nodeId
 *    - query - text search value.
 *
 *  hiddenName: - form name for this field
 *
 *  This components include some events for ComboBox and list config
 *
 * Server response:
 * [
 *  {
 *      id: 175, // node id
 *      isTarget: true,
 *      leaf: true,
 *      parent_id: 164, // parent node id
 *      path: "/0/164/175", // path
 *      text: "Node Value1", // value to show
 *      weight: 6
 *  },
 *  {
 *      id: 176,
 *      isTarget: true,
 *      leaf: true,
 *      parent_id: 164,
 *      path: "/0/164/176",
 *      text: "Node Value2",
 *      weight: 6
 *  }
 * ]
 *
 */
Ext.ux.form.TreeCombo = Ext.extend(Ext.form.TriggerField, {
  mode: 'remote', // the only mode that is supported currently
  minListWidth : 70,
  lazyInit : true,
  shadow : 'sides',
  listClass : '',
  listAlign : 'tl-bl?',
  maxHeight : 300,
  minHeight : 90,

  directFn: null,
  displayFullName: false,
  fullNameSeparator: ' / ',
  parentPath: null, // parent node path
  treeCfg: {},
  allQuery: '',
  queryDelay : 500,
  minChars: 3,
  triggerAction: 'query',

  initComponent: function() {
    this.lastQuery = '';
    this.baseNode = 0;
    this.baseNodeCache = 0;
    this.treeCfg = Ext.apply({}, this.treeCfg, {});
    if (Ext.isEmpty(this.loaderParams)) {
      this.loaderParams = {};
    }
    this.loaderParams['current'] = false;

    Ext.ux.form.TreeCombo.superclass.initComponent.call(this);
    this.addEvents(
      'expand',
      'collapse',
      'beforeselect',
      'select',
      'beforequery',
      'pathquery'
    );
  },

  // private
  onRender : function(ct, position) {
    if(this.hiddenName && !Ext.isDefined(this.submitValue)) {
      this.submitValue = false;
    }

    Ext.ux.form.TreeCombo.superclass.onRender.call(this, ct, position);
    this.el.dom.removeAttribute('name');
    if(this.hiddenName){
      this.hiddenField = this.el.insertSibling({tag:'input', type:'hidden', name: this.hiddenName,
        id: (this.hiddenId || Ext.id())}, 'before', true);
    }
    if(Ext.isGecko) {
      this.el.dom.setAttribute('autocomplete', 'off');
    }

    if(!this.lazyInit) {
      this.initList();
    } else {
      this.on('focus', this.initList, this, {single: true});
    }
  },

  // private
  getParentZIndex : function(){
    var zindex;
    if (this.ownerCt){
      this.findParentBy(function(ct){
        zindex = parseInt(ct.getPositionEl().getStyle('z-index'), 10);
        return !!zindex;
      });
    }
    return zindex;
  },

  // private
  getZIndex : function(listParent){
    listParent = listParent || Ext.getDom(this.getListParent() || Ext.getBody());
    var zindex = parseInt(Ext.fly(listParent).getStyle('z-index'), 10);
    if(!zindex){
      zindex = this.getParentZIndex();
    }
    return (zindex || 12000) + 5;
  },

  // private
  initList : function() {
    if(!this.list) {
      var cls = 'x-combo-list',
        listParent = Ext.getDom(this.getListParent() || Ext.getBody());

      this.list = new Ext.Layer({
        parentEl: listParent,
        shadow: this.shadow,
        cls: [cls, this.listClass].join(' '),
        constrain:false,
        zindex: this.getZIndex(listParent)
      });

      var lw = this.listWidth || Math.max(this.wrap.getWidth(), this.minListWidth);
      this.list.setSize(lw, 0);
      if(this.syncFont !== false){
        this.list.setStyle('font-size', this.el.getStyle('font-size'));
      }

      this.innerList = this.list.createChild({cls:cls+'-inner'});
      this.innerList.setWidth(lw - this.list.getFrameWidth('lr'));

      this.view = new Ext.tree.TreePanel(Ext.applyIf({
        applyTo: this.innerList,
        singleExpand: true,
        useArrows: true,
        autoScroll: true,
        animate: false,
        frame: false,
        containerScroll: false,
        border: false,
        loader: this.getTreeLoader(),
        rootVisible: false,
        root: {
          nodeType: 'async',
          editable: false,
          text: 'Root node',
          id: this.baseNode.toString()
        },
        internalRender: this.strict || !Ext.isIE9m,
        ctCls: 'x-menu-tree-item'
      }, this.initialConfig.treeCfg));

      this.mon(this.view, {
        containerclick: this.onViewContainerClick,
        click: this.onViewClick,
        expandnode: this.onNodeExpand,
        collapsenode: this.onNodeExpand,
        scope: this
      });

      if (this.resizable) {
        this.resizer = new Ext.Resizable(this.list,  {
          pinned: true, handles:'se'
        });
        this.mon(this.resizer, 'resize', function(r, w, h){
          this.maxHeight = h-this.handleHeight-this.list.getFrameWidth('tb');
          this.listWidth = w;
          this.innerList.setWidth(w - this.list.getFrameWidth('lr'));
          this.restrictHeight();
        }, this);
      }
    }

    this.mon(this.view.getSelectionModel(), 'beforeselect', function(v, node, last) {
      if (node && node.id > 0) {
        return this.fireEvent('beforeselect', this, node, last);
      }
      return true;
    }, this);

    this.mon(this.view.getSelectionModel(), 'selectionchange', function(v, node, last) {
      if (node && node.id > 0) {
        return this.onSelect(node);
      } else {

        return false;
      }
    }, this);
  },

  // private
  getTreeLoader: function () {
    if (!Ext.isDefined(this.directFn) || !Ext.isFunction(this.directFn)) {
      Ext.Error('Не указана функция загрузки списка');
    }
    return new Ext.tree.TreeLoader({
      preloadChildren: true,
      directFn: this.getDirectFn()
    });
  },

  // private
  getDirectFn: function() {
    var me = this, direct_fn = me.directFn;

    return function (n, cb) {
      var params = Ext.apply({}, me.loaderParams || {});
      if (n > 0) {
        params.node = n;
      }
      direct_fn(params, cb);
    }.createDelegate(me);
  },

  // private
  onResize : function(w, h){
    Ext.form.ComboBox.superclass.onResize.apply(this, arguments);
    if(!isNaN(w) && this.isVisible() && this.list){
      this.doResize(w);
    }else{
      this.bufferSize = w;
    }
  },

  // private
  doResize: function(w){
    if(!Ext.isDefined(this.listWidth)){
      var lw = Math.max(w, this.minListWidth);
      this.list.setWidth(lw);
      this.innerList.setWidth(lw - this.list.getFrameWidth('lr'));
    }
  },

  // private
  onEnable : function(){
    Ext.form.ComboBox.superclass.onEnable.apply(this, arguments);
    if(this.hiddenField){
      this.hiddenField.disabled = false;
    }
  },

  // private
  onDisable : function(){
    Ext.form.ComboBox.superclass.onDisable.apply(this, arguments);
    if(this.hiddenField){
      this.hiddenField.disabled = true;
    }
  },

  getListParent : function() {
    return document.body;
  },

  // private
  onViewClick: function(node) {
    this.select(node);
  },

  // private
  onSelect: function(node) {
    if (this.fireEvent('select', this, node) !== false) {
      this.selectedNode = node;
      this.setValue(node);
      this.parentPath = Ext.isDefined(node.attributes.path) ? this.calcRelativePath(node.attributes.path) : node.getPath('id');
    }
  },

  /**
   * Return field name
   * @returns {*}
   */
  getName: function(){
    var hf = this.hiddenField;
    return hf && hf.name ? hf.name : this.hiddenName || Ext.ux.form.TreeCombo.superclass.getName.call(this);
  },

  /**
   * Return field value
   * @returns {string}
   */
  getValue: function() {
    return Ext.isDefined(this.value) ? this.value : '';
  },

  /**
   * Clear field
   */
  clearValue: function() {
    if(this.hiddenField ) {
      this.hiddenField.value = '';
    }
    this.baseNode = this.baseNodeCache.toString();
    this.setRawValue('');
    this.applyEmptyText();
    this.value = '';
    this.parentPath = '';
    if (this.view) {
      this.view.getSelectionModel().clearSelections(true);
    }
  },

  /**
   * Set combo value
   * @param v
   */
  setValue: function(v) {
    var id = v;
    var node;
    if (v instanceof Ext.tree.TreeNode) {
      node = v;
      id = node.id;
      if (id == this.getValue()) {
        return;
      }
      Ext.ux.form.TreeCombo.superclass.setValue.call(this, this.getTextValue(node));
      if(this.hiddenField){
        this.hiddenField.value = Ext.value(id, '');
      }
      this.selectedNode = node;
      this.value = id;
    } else {
      this.selectedNode = null;
      var me = this;
      if (id > 0) {
        if (id == this.getValue()) {
          return;
        }
        this.loaderParams['current'] = true;
        this.getDirectFn()(id, function(response) {
          me.loaderParams['current'] = false;
          if (Ext.isArray(response) && !Ext.isEmpty(response)) {
            if (!me.view) {
              me.initList();
            }
            var node = me.view.loader.createNode(response.shift());
            me.setValue(node);
          }
        });
      } else {
        this.clearValue();
      }
    }
  },

  // private
  getTextValue: function(node) {
    var me = this;
    var textValue = node.text;
    var parentNode;

    while (me.displayFullName === true && (parentNode = node.parentNode) && parentNode !== null && parentNode.isRoot !== true) {
      textValue = parentNode.text + me.fullNameSeparator + textValue;
      node = node.parentNode;
    }

    return textValue;
  },

  // private
  onViewContainerClick: function(panel) {
    var node = panel.getSelectionModel().getSelectedNode();
    if (node) {
      this.onViewClick(node);
    } else {
      this.collapse();
    }
  },

  // private
  onNodeExpand: function(node) {
    if(this.isExpanded()) {
      this.restrictHeight();
    }
  },

  // private
  collapse: function() {
    if (!this.isExpanded()) {
      return;
    }
    this.list.hide();
    Ext.getDoc().un('mousewheel', this.collapseIf, this);
    Ext.getDoc().un('mousedown', this.collapseIf, this);
    this.fireEvent('collapse', this);
  },

  // private
  collapseIf: function(e) {
    if(!this.isDestroyed && !e.within(this.wrap) && !e.within(this.list)){
      this.collapse();
    }
  },

  isExpanded: function(){
    return this.list && this.list.isVisible();
  },

  // private
  expand: function() {
    if(this.isExpanded() || !this.hasFocus) {
      return;
    }

    if(this.bufferSize) {
      this.doResize(this.bufferSize);
      delete this.bufferSize;
    }
    this.list.alignTo.apply(this.list, [this.el].concat(this.listAlign));

    // zindex can change, re-check it and set it if necessary
    this.list.setZIndex(this.getZIndex());
    this.list.show();
    if(Ext.isGecko2){
      this.innerList.setOverflow('auto'); // necessary for FF 2.0/Mac
    }
    this.mon(Ext.getDoc(), {
      scope: this,
      mousewheel: this.collapseIf,
      mousedown: this.collapseIf
    });
    this.fireEvent('expand', this);
  },

  // private
  select: function(node, scrollIntoView) {
    this.view.getSelectionModel().select(node);
    this.selectedNode = node;

    if (scrollIntoView !== false) {
      var n = this.view.getSelectionModel().getSelectedNode();
      if (n && n.getUI() && n.getUI().getEl()) {
        this.innerList.scrollChildIntoView(n.getUI().getEl(), false);
      }
    }
    this.collapse();
  },

  // private
  selectNext: function(){
    if (!this.view.getSelectionModel().getSelectedNode()) {
      this.view.getSelectionModel().select(this.view.root);
    }
    this.view.getSelectionModel().selectNext();
    this.selectedNode = this.view.getSelectionModel().getSelectedNode();
  },

  // private
  selectPrev: function() {
    this.view.getSelectionModel().selectPrevious();
    this.selectedNode = this.view.getSelectionModel().getSelectedNode();
  },

  // private
  restrictHeight: function() {
    this.innerList.dom.style.height = '';
    var inner = this.innerList.dom,
      pad = this.list.getFrameWidth('tb') + (this.resizable ? this.handleHeight : 0),
      h = Math.max(inner.clientHeight, inner.offsetHeight, inner.scrollHeight),
      ha = this.getPosition()[1]-Ext.getBody().getScroll().top,
      hb = Ext.lib.Dom.getViewHeight()-ha-this.getSize().height,
      space = Math.max(ha, hb, this.minHeight || 0)-this.list.shadowOffset-pad-5;

    h = Math.min(h, space, this.maxHeight);

    this.innerList.setHeight(h);
    this.list.beginUpdate();
    this.list.setHeight(h+pad);
    this.list.alignTo.apply(this.list, [this.el].concat(this.listAlign));
    this.list.endUpdate();
  },

  // private
  validateBlur : function(){
    return !this.list || !this.list.isVisible();
  },

  // private
  postBlur: function() {
    Ext.ux.form.TreeCombo.superclass.postBlur.call(this);
    this.collapse();
  },

  // private
  doQuery : function(q, forceAll) {
    var me = this;
    Ext.apply(this.loaderParams, {
      query: q,
      forceAll: forceAll,
      cancel: false
    });

    if(this.fireEvent('beforequery', this.loaderParams) === false || this.loaderParams.cancel) {
      return false;
    }
    var root = me.view.getRootNode();
    if (!root || root.id != me.baseNode) {
      me.lastQuery = '';
      me.resetRoot([]);
    }

    if (forceAll === true || (q.length < this.minChars)) {
      if (!Ext.isEmpty(me.lastQuery)) {
        me.resetRoot([]);
      }
      me.lastQuery = '';
      this.openList();
    } else if (me.lastQuery != me.loaderParams.query) {
      this.getDirectFn()(me.baseNode.toString(), function(response) {
        me.lastQuery = me.loaderParams.query;
        me.loaderParams['query'] = '';
        if (response && response.length) {
          me.expand();
          me.loadNodes(response);
          me.view.expandAll();
        } else {
          me.resetRoot([]);
          me.collapse();
        }
      });
    } else {
      this.openList();
    }
  },

  /**
   * Loads nodes
   */
  loadNodes: function(nodes) {
    if (this.view) {
      var nodesTree = this.buildNodeTree(nodes);

      this.resetRoot(nodesTree);
    }
  },

  resetRoot: function(children) {
    if (Ext.isEmpty(children)) {
      children = [];
    }

    this.view.getRootNode().removeAll(true);

    var root = {
      id: this.baseNode.toString(),
      editable: false,
      text: 'Root node',
      nodeType: 'async'
    };

    if (children.length > 0) {
      root.children = children;
    }

    this.view.setRootNode(root);
  },

  // private
  buildNodeTree: function(nodes) {
    var treeLinks = {};
    var rootId = this.baseNode.toString();
    var rootEls = [];
    Ext.each(nodes, function(node) {
      if (!treeLinks.hasOwnProperty(node.id)) {
        treeLinks[node.id] = node;
      }

      if (!node.parent_id  || rootId == node.parent_id) {
        rootEls.push(node);
      }
    });

    Ext.iterate(treeLinks, function(id, node) {
      if (Ext.isDefined(treeLinks[node.parent_id])) {
        var parent = treeLinks[node.parent_id];
        if (!Ext.isDefined(parent.children)) {
          parent.children = [];
        }
        parent.children.push(node);
      }
    });

    return rootEls;
  },

  // private
  openList: function() {
    this.expand();
    this.view.expand();
    var me = this;
    if (!Ext.isEmpty(this.parentPath)) {
      this.view.expandPath(this.parentPath, 'id', function (success, node) {
        if (success) {
          if (node.getUI() && node.getUI().getEl()) {
            me.innerList.scrollChildIntoView(node.getUI().getEl(), false);
          }
        }
      });
    }
    this.restrictHeight();
  },

  onTriggerClick: function(){
    if (this.readOnly || this.disabled) {
      return;
    }
    if (this.isExpanded()) {
      this.collapse();
      this.el.focus();
    } else {
      this.onFocus({});
      if(this.triggerAction == 'all') {
        this.doQuery(this.allQuery, true);
      } else {
        this.doQuery(this.getRawValue());
      }
      this.el.focus();
    }
    this.restrictHeight();
  },

  reset : function() {
    Ext.ux.form.TreeCombo.superclass.reset.call(this);
    this.clearValue();
    if (this.view) {
      this.resetRoot([]);
      this.collapse();
      Ext.apply(this.loaderParams, {
        query: '',
        forceAll: true,
        cancel: false,
        node: 0
      });
    }
  },

  /**
   * Replace rootNode for this combo
   * @param {Number} v
   */
  setBaseValue: function(v) {
    Ext.apply(this.loaderParams, {
      query: '',
      forceAll: true,
      cancel: false,
      node: parseInt(v)
    });
    this.baseNode = v;
    this.baseNodeCache = v;

    if (this.view) {
      if (this.hasFocus) {
        this.resetRoot([]);
      }
      this.collapse();
    }

    this.parentPath = '';
    this.lastQuery = '';
  },

  // private
  initEvents : function(){
    Ext.ux.form.TreeCombo.superclass.initEvents.call(this);

    this.keyNav = new Ext.KeyNav(this.el, {
      "up" : function(e) {
        this.selectPrev();
      },

      "down" : function(e){
        if(!this.isExpanded()) {
          this.onTriggerClick();
        } else {
          this.selectNext();
        }
      },

      "enter" : function(e) {
        if (this.view) {
          var node = this.view.getSelectionModel().getSelectedNode();
          if (node) {
            this.onViewClick(node);
          }
        }
      },

      "esc" : function(e) {
        this.collapse();
      },

      scope : this,

      doRelay : function(e, h, hname) {
        if(hname == 'down' || this.scope.isExpanded()) {
          var relay = Ext.KeyNav.prototype.doRelay.apply(this, arguments);
          if((((Ext.isIE9 && Ext.isStrict) || Ext.isIE10p) || !Ext.isIE) && Ext.EventManager.useKeydown) {
            this.scope.fireKey(e);
          }
          return relay;
        }
        return true;
      },

      forceKeyDown : true,
      defaultEventAction: 'stopEvent'
    });

    this.dqTask = new Ext.util.DelayedTask(this.initQuery, this);
    if (!this.enableKeyEvents) {
      this.mon(this.el, 'keyup', this.onKeyUp, this);
    }
  },

  // private
  initQuery : function() {
    this.doQuery(this.getRawValue());
  },

  // private
  fireKey : function(e) {
    if (!this.isExpanded()) {
      Ext.ux.form.TreeCombo.superclass.fireKey.call(this, e);
    }
  },

  // private
  onDestroy : function() {
    if (this.dqTask) {
      this.dqTask.cancel();
      this.dqTask = null;
    }

    Ext.destroy(
      this.resizer,
      this.view,
      this.list
    );
    Ext.destroyMembers(this, 'hiddenField');
    Ext.ux.form.TreeCombo.superclass.onDestroy.call(this);
  },

  // private
  initValue : function() {
    if(this.hiddenField) {
      this.value = Ext.value(Ext.isDefined(this.hiddenValue) ? this.hiddenValue : this.value, '');
      this.hiddenField.value = this.value;
    }
    Ext.ux.form.TreeCombo.superclass.initValue.call(this);
  },

  // private
  onKeyUp : function(e) {
    var k = e.getKey();
    if(this.editable !== false && this.readOnly !== true && (k == e.BACKSPACE || !e.isSpecialKey())) {

      this.lastKey = k;
      this.dqTask.delay(this.queryDelay);
    }
    Ext.ux.form.TreeCombo.superclass.onKeyUp.call(this, e);
  },

  // private
  calcRelativePath: function(path) {
    var root = this.view.getRootNode();
    var reg = new RegExp('\/' + root.id + '.*');
    var m = path.match(reg);

    if (m) {
      return m.shift();
    } else {
      return path;
    }
  }
});

Ext.reg('treecombo', Ext.ux.form.TreeCombo);
