const TOGGLE_TOOL_SERIES = 'series';
const TOGGLE_TOOL_CLASSIFICATION = 'classification';

/**
 * @class Oskari.statistics.statsgrid.StatsGridBundleInstance
 *
 * Sample extension bundle definition which inherits most functionalty
 * from DefaultExtension class.
 */
Oskari.clazz.define(
    'Oskari.statistics.statsgrid.StatsGridBundleInstance',
    /**
     * @static constructor function
     */
    function () {
        // these will be used for this.conf if nothing else is specified (handled by DefaultExtension)
        this.defaultConf = {
            name: 'StatsGrid',
            sandbox: 'sandbox',
            stateful: true,
            tileClazz: 'Oskari.statistics.statsgrid.Tile',
            vectorViewer: false
        };
        this.visible = false;

        this.log = Oskari.log('Oskari.statistics.statsgrid.StatsGridBundleInstance');

        this._lastRenderMode = null;

        this.togglePlugin = null;
        this.diagramPlugin = null;
        this.classificationPlugin = null;
        this.seriesControlPlugin = null;

        this.regionsetViewer = null;
        this.flyoutManager = null;
        this._layerId = 'STATS_LAYER';
    }, {
        afterStart: function (sandbox) {
            var me = this;
            var mapModule = sandbox.findRegisteredModuleInstance('MainMapModule');
            var locale = Oskari.getMsg.bind(null, 'StatsGrid');
            // create the StatisticsService for handling ajax calls and common functionality.
            var statsService = Oskari.clazz.create('Oskari.statistics.statsgrid.StatisticsService', sandbox, locale);
            sandbox.registerService(statsService);
            me.statsService = statsService;

            var conf = this.getConfiguration() || {};

            // Check if vector is configurated
            // If it is set map modes to support also vector
            if (conf && conf.vectorViewer === true) {
                me.statsService.setMapModes(['wms', 'vector']);
            }
            statsService.addDatasource(conf.sources);
            statsService.addRegionset(conf.regionsets);

            // initialize flyoutmanager
            this.flyoutManager = Oskari.clazz.create('Oskari.statistics.statsgrid.FlyoutManager', this, statsService);
            this.flyoutManager.init();
            this.getTile().setupTools(this.flyoutManager);

            // disable tile if we don't have anything to show or enable if we do
            // setup initial state
            this.setState();

            this.togglePlugin = Oskari.clazz.create('Oskari.statistics.statsgrid.TogglePlugin', this.getFlyoutManager(), this.getLocalization().published);
            mapModule.registerPlugin(this.togglePlugin);
            mapModule.startPlugin(this.togglePlugin);

            if (this.isEmbedded()) {
                // Start in an embedded map mode
                me.createClassficationView();

                if (me.conf.grid) {
                    me.togglePlugin.addTool('table');
                }
                if (me.conf.diagram) {
                    me.togglePlugin.addTool('diagram');
                }
                if (me.conf.classification) {
                    me.addMapPluginToggleTool(TOGGLE_TOOL_CLASSIFICATION);
                }
                if (me.conf.series) {
                    me.addMapPluginToggleTool(TOGGLE_TOOL_SERIES);
                }
            }
            // Add tool for statslayers so selected layers can show a link to open the statsgrid functionality
            this.__setupLayerTools();
            // setup DataProviderInfoService group if possible (LogoPlugin)
            var dsiservice = this.getSandbox().getService('Oskari.map.DataProviderInfoService');
            if (dsiservice) {
                dsiservice.addGroup('indicators', this.getLocalization().dataProviderInfoTitle || 'Indicators');
            }

            // regionsetViewer creation need be there because of start order
            this.regionsetViewer = Oskari.clazz.create('Oskari.statistics.statsgrid.RegionsetViewer', this, sandbox, this.conf);

            // Check that user has own indicators datasource
            if (statsService.getUserDatasource()) {
                // Crete indicators tab to personal data view if personaldata bundle exists
                var reqName = 'PersonalData.AddTabRequest';
                if (sandbox.hasHandler(reqName)) {
                    me._addIndicatorsTabToPersonalData(sandbox);
                } else {
                    // Wait for the application to load all bundles and try again
                    Oskari.on('app.start', function (details) {
                        if (sandbox.hasHandler(reqName)) {
                            me._addIndicatorsTabToPersonalData(sandbox);
                        }
                    });
                }
            }
        },
        addMapPluginToggleTool: function (tool) {
            if (!this.togglePlugin || !tool) {
                return;
            }
            let plugin;
            switch (tool) {
            case TOGGLE_TOOL_CLASSIFICATION:
                plugin = 'classificationPlugin'; break;
            case TOGGLE_TOOL_SERIES:
                plugin = 'seriesControlPlugin'; break;
            }
            if (!plugin) {
                return;
            }
            this.togglePlugin.addTool(tool, () => {
                if (this[plugin]) {
                    this[plugin].toggleUI();
                }
            });
            let visible = this[plugin] && !!this[plugin].getElement();
            this.togglePlugin.toggleTool(tool, visible);
        },
        _addIndicatorsTabToPersonalData: function (sandbox) {
            var reqBuilder = Oskari.requestBuilder('PersonalData.AddTabRequest');
            if (typeof reqBuilder === 'function') {
                var tab = Oskari.clazz.create('Oskari.statistics.statsgrid.MyIndicatorsTab', this);
                tab.bindEvents();
                var addAsFirstTab = false;
                var req = reqBuilder(tab.getTitle(), tab.getContent(), addAsFirstTab, tab.getId());
                sandbox.request(this, req);
            }
        },
        isEmbedded: function () {
            return jQuery('#contentMap').hasClass('published');
        },
        hasData: function () {
            return !!this.statsService.getDatasource().length;
        },
        getLayerId: function () {
            return this._layerId;
        },
        /**
         * Update visibility of classification / legend based on idicators length & stats layer visibility
         */
        _updateClassficationViewVisibility: function () {
            const service = this.statsService.getStateService();
            var indicatorsExist = service.hasIndicators();
            var layer = this.getLayerService().findMapLayer(this._layerId);
            var layerVisible = layer ? layer.isVisible() : true;
            const visible = indicatorsExist && layerVisible;
            service.updateClassificationPluginState('visible', visible);
            if (visible) {
                this.createClassficationView();
            }
        },
        /**
         * Update visibility of series control based on active indicator & stats layer visibility
         */
        _updateSeriesControlVisibility: function () {
            const isSeriesActive = this.statsService.getStateService().isSeriesActive();
            const layer = this.getLayerService().findMapLayer(this._layerId);
            const layerVisible = layer ? layer.isVisible() : true;
            this.setSeriesControlVisible(isSeriesActive && layerVisible);
        },
        /**
         * Fetches reference to the map layer service
         * @return {Oskari.mapframework.service.MapLayerService}
         */
        getLayerService: function () {
            return this.getSandbox().getService('Oskari.mapframework.service.MapLayerService');
        },
        getFlyoutManager: function () {
            return this.flyoutManager;
        },
        getStatisticsService: function () {
            return this.statsService;
        },
        getDataProviderInfoService: function () {
            if (this.dataProviderInfoService) {
                return this.dataProviderInfoService;
            }
            this.dataProviderInfoService = this.getSandbox().getService('Oskari.map.DataProviderInfoService');
            return this.dataProviderInfoService;
        },
        /**
         * This will trigger an update on the LogoPlugin/Datasources popup when available.
         * @param  {StatsGrid.IndicatorEvent} event
         */
        notifyDataProviderInfo: function (event) {
            const ind = {
                datasource: event.getDatasource(),
                indicator: event.getIndicator(),
                selections: event.getSelections()
            };
            if (event.isRemoved()) {
                this.removeDataProviverInfo(ind);
            } else {
                this.addDataProviderInfo(ind);
            }
        },
        removeDataProviverInfo: function (ind) {
            const { datasource, indicator } = ind;
            // the check if necessary if the same indicator is added more than once with different selections
            if (!this.statsService.getStateService().isSelected(datasource, indicator)) {
                // if this was the last dataset for the datasource & indicator. Remove it.
                const service = this.getDataProviderInfoService();
                if (service) {
                    const id = datasource + '_' + indicator;
                    service.removeItemFromGroup('indicators', id);
                }
            }
        },
        addDataProviderInfo: function (ind) {
            const service = this.getDataProviderInfoService();
            if (!service) return;
            const { datasource, indicator, selections } = ind;
            const { name, info: { url } } = this.statsService.getDatasource(datasource);
            const id = datasource + '_' + indicator;

            const callback = labels => {
                const data = {
                    id,
                    name: labels.indicator,
                    source: [labels.source, { name, url }]
                };
                if (!service.addItemToGroup('indicators', data)) {
                    // if adding failed, it might because group was not registered.
                    service.addGroup('indicators', this.getLocalization().dataProviderInfoTitle);
                    // Try adding again
                    service.addItemToGroup('indicators', data);
                }
            };
            this.statsService.getUILabels({ datasource, indicator, selections }, callback);
        },
        clearDataProviderInfo: function () {
            var service = this.getSandbox().getService('Oskari.map.DataProviderInfoService');
            service.removeGroup('indicators');
        },
        eventHandlers: {
            'StatsGrid.StateChangedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
                this._updateClassficationViewVisibility();
                this._updateSeriesControlVisibility();
                if (evt.isReset()) {
                    this.clearDataProviderInfo();
                } else {
                    this.statsService.getStateService().getIndicators().forEach(ind => {
                        this.addDataProviderInfo(ind);
                    });
                }
            },
            'StatsGrid.IndicatorEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
                this.notifyDataProviderInfo(evt);
                this._updateClassficationViewVisibility();
            },
            'StatsGrid.RegionsetChangedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'StatsGrid.RegionSelectedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'StatsGrid.ActiveIndicatorChangedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
                this._updateSeriesControlVisibility();
            },
            'StatsGrid.ClassificationChangedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'StatsGrid.DatasourceEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'StatsGrid.ParameterChangedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'StatsGrid.Filter': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'MapSizeChangedEvent': function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            'UIChangeEvent': function (evt) {
                this.getSandbox().postRequestByName('userinterface.UpdateExtensionRequest', [this, 'close']);
            },
            'userinterface.ExtensionUpdatedEvent': function (event) {
                var me = this;
                // Not handle other extension update events
                if (event.getExtension().getName() !== me.getName()) {
                    return;
                }
                var wasClosed = event.getViewState() === 'close';
                // moving flyout around will trigger attach states on each move
                var visibilityChanged = this.visible === wasClosed;
                this.visible = !wasClosed;
                if (!visibilityChanged) {
                    return;
                }
                if (wasClosed) {
                    me.getTile().hideExtensions();
                } else {
                    me.getTile().showExtensions();
                }
            },
            AfterMapLayerRemoveEvent: function (event) {
                var layer = event.getMapLayer();
                if (!layer || layer.getId() !== this._layerId) {
                    return;
                }
                var emptyState = {};
                this.setState(emptyState);
                this.removeClassificationView();
            },
            /**
             * @method MapLayerEvent
             * @param {Oskari.mapframework.event.common.MapLayerEvent} event
             *
             */
            MapLayerEvent: function (event) {
                if (!this.getTile()) {
                    return;
                }
                // Enable tile when stats layer is available
                // this.getTile().setEnabled(this.hasData());
                // setup tools for new layers
                if (event.getOperation() !== 'add') {
                    // only handle add layer
                    return;
                }
                if (event.getLayerId()) {
                    this.__addTool(event.getLayerId());
                } else {
                    // ajax call for all layers
                    this.__setupLayerTools();
                }
            },
            MapLayerVisibilityChangedEvent: function (event) {
                var layer = event.getMapLayer();
                if (!layer || layer.getId() !== this._layerId) {
                    return;
                }
                this._updateClassficationViewVisibility();
                this._updateSeriesControlVisibility();
            },
            FeatureEvent: function (evt) {
                this.statsService.notifyOskariEvent(evt);
            },
            AfterChangeMapLayerOpacityEvent: function (evt) {
                if (evt.getMapLayer().getId() !== this._layerId) {
                    return;
                }
                // record opacity for published map etc
                this.statsService.getStateService().updateClassificationTransparency(evt.getMapLayer().getOpacity());
                this.statsService.notifyOskariEvent(evt);
            }
        },

        /**
         * Adds the Feature data tool for layer
         * @param  {String| Number} layerId layer to process
         * @param  {Boolean} suppressEvent true to not send event about updated layer (optional)
         */
        __addTool: function (layerModel, suppressEvent) {
            var me = this;
            var service = this.getLayerService();
            if (typeof layerModel !== 'object') {
                // detect layerId and replace with the corresponding layerModel
                layerModel = service.findMapLayer(layerModel);
            }
            if (!layerModel || !layerModel.isLayerOfType('STATS')) {
                return;
            }
            // add feature data tool for layer
            var layerLoc = this.getLocalization('layertools').table_icon || {};
            var label = layerLoc.title || 'Thematic maps';
            var tool = Oskari.clazz.create('Oskari.mapframework.domain.Tool');
            tool.setName('table_icon');
            tool.setTitle(label);
            tool.setTooltip(layerLoc.tooltip || label);
            tool.setCallback(function () {
                me.sandbox.postRequestByName('userinterface.UpdateExtensionRequest', [me, 'attach']);
            });

            service.addToolForLayer(layerModel, tool, suppressEvent);
        },
        /**
         * Adds tools for all layers
         */
        __setupLayerTools: function () {
            var me = this;
            // add tools for feature data layers
            var service = this.getLayerService();
            var layers = service.getAllLayers();
            _.each(layers, function (layer) {
                me.__addTool(layer, true);
            });
            // update all layers at once since we suppressed individual events
            var event = Oskari.eventBuilder('MapLayerEvent')(null, 'tool');
            me.sandbox.notifyAll(event);
        },

        /**
         * Sets the map state to one specified in the parameter. State is bundle specific, check the
         * bundle documentation for details.
         *
         * @method setState
         * @param {Object} state bundle state as JSON
         */
        setState: function (state) {
            state = state || this.state || {};
            this.statsService.getStateService().setState(state);
            // if state says view was visible fire up the UI, otherwise close it
            var sandbox = this.getSandbox();
            var uimode = state.view ? 'attach' : 'close';
            sandbox.postRequestByName('userinterface.UpdateExtensionRequest', [this, uimode]);
        },
        getState: function () {
            var state = this.statsService.getStateService().getState();
            return {
                ...state,
                view: this.visible
            };
        },
        createClassficationView: function () {
            if (this.classificationPlugin) {
                return;
            }
            var config = jQuery.extend(true, {}, this.getConfiguration());
            var sandbox = this.getSandbox();
            var locale = Oskari.getMsg.bind(null, 'StatsGrid');
            var mapModule = sandbox.findRegisteredModuleInstance('MainMapModule');

            this.classificationPlugin = Oskari.clazz.create('Oskari.statistics.statsgrid.ClassificationPlugin', this, config, locale, sandbox);
            this.classificationPlugin.on('show', () => this.togglePlugin && this.togglePlugin.toggleTool(TOGGLE_TOOL_CLASSIFICATION, true));
            this.classificationPlugin.on('hide', () => this.togglePlugin && this.togglePlugin.toggleTool(TOGGLE_TOOL_CLASSIFICATION, false));
            mapModule.registerPlugin(this.classificationPlugin);
            mapModule.startPlugin(this.classificationPlugin);
            this.classificationPlugin.buildUI();
        },
        removeClassificationView: function () {
            if (this.classificationPlugin) {
                const mapModule = this.getSandbox().findRegisteredModuleInstance('MainMapModule');
                mapModule.unregisterPlugin(this.classificationPlugin);
                mapModule.stopPlugin(this.classificationPlugin);
                this.classificationPlugin = null;
            }
        },
        setSeriesControlVisible: function (visible) {
            if (visible) {
                if (this.seriesControlPlugin) {
                    if (!this.seriesControlPlugin.getElement()) {
                        this.seriesControlPlugin.redrawUI();
                    }
                } else {
                    this.createSeriesControl();
                }
            } else {
                if (this.seriesControlPlugin) {
                    this.seriesControlPlugin.stopPlugin();
                }
            }
        },
        createSeriesControl: function () {
            var sandbox = this.getSandbox();
            var locale = Oskari.getMsg.bind(null, 'StatsGrid');
            var mapModule = sandbox.findRegisteredModuleInstance('MainMapModule');

            this.seriesControlPlugin = Oskari.clazz.create('Oskari.statistics.statsgrid.SeriesControlPlugin', this, {}, locale, sandbox);
            this.seriesControlPlugin.on('show', () => this.togglePlugin && this.togglePlugin.toggleTool(TOGGLE_TOOL_SERIES, true));
            this.seriesControlPlugin.on('hide', () => this.togglePlugin && this.togglePlugin.toggleTool(TOGGLE_TOOL_SERIES, false));
            mapModule.registerPlugin(this.seriesControlPlugin);
            mapModule.startPlugin(this.seriesControlPlugin);
        }

    }, {
        extend: ['Oskari.userinterface.extension.DefaultExtension']
    }
);
