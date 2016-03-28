/* jshint undef: true, unused: true, browser: true, jquery: true, devel: true */
/* global define */

define(['jquery', 'v3/input/richtextCodeMirror', 'v3/plugin/popup', 'jquery.extra', 'jquery.handsontable.full'], function($, CodeMirrorRte) {

    var CONTEXT_PATH, Rte;

    // Global variable set by the CMS, typically "/cms/"
    CONTEXT_PATH = window.CONTEXT_PATH || '';

    // Global variable set by the CMS containing custom toolbar styles
    // For example:
    // var CSS_CLASS_GROUPS = [
    //   {"internalName":"PatStylesInternal","dropDown":true,"displayName":"PatStyles","cssClasses":[
    //     {"internalName":"PatStyle1Internal","displayName":"PatStyle1","tag":"EM"},
    //     {"internalName":"PatStyle2Internal","displayName":"PatStyle2","tag":"STRONG"}
    //   ]}];


    // Global variable set by the CMS containing image sizes to be used for enhancements
    // For example:
    // var STANDARD_IMAGE_SIZES = [
    //   {"internalName":"500x500 Square","displayName":"500x500 Square"},
    //   {"internalName":"640x400","displayName":"640x400"}
    // ];


    // Private variable used to tell if the custom CMS styles have been loaded.
    // We only need to load them once.
    var customStylesLoaded = false;

    // Counter used for popup frames
    var frameTargetCounter = 0;

    /**
     * @class
     * Rich text editor.
     * Uses the CodeMirrorRte to provide editing interface, but
     * this object provides the following functionality:
     *  - defines which styles are supported
     *  - provides a toolbar
     *  - sets up keyboard shortcuts
     *  - provides an interface for enhancements
     *  - provides an interface for links
     *
     * @example
     * rte = Object.create(Rte);
     * rte.init('#mytextarea');
     */
    Rte = {

        /**
         * Style definitions to pass to the CodeMirrorRte.
         */
        styles: {

            bold: {
                className: 'rte2-style-bold',
                element: 'b',
                keymap: ['Ctrl-B', 'Cmd-B']
            },
            italic: {
                className: 'rte2-style-italic',
                element: 'i',
                keymap: ['Ctrl-I', 'Cmd-I']
            },
            underline: {
                className: 'rte2-style-underline',
                element: 'u',
                keymap: ['Ctrl-U', 'Cmd-U']
            },
            strikethrough: {
                className: 'rte2-style-strikethrough',
                element: 'strike'
            },
            superscript: {
                className: 'rte2-style-superscript',
                element: 'sup',
                clear: ['subscript']
            },
            subscript: {
                className: 'rte2-style-subscript',
                element: 'sub',
                clear: ['superscript']
            },
            comment: {
                className: 'rte2-style-comment',
                element: 'span',
                elementAttr: {
                    'class': 'rte rte-comment'
                },
                
                // Hide this style when viewing in "show final" mode
                showFinal:false,
                
                // Don't let this style be removed by the "Clear" toolbar button
                internal: true,

                onCreate: function (mark) {
                    var $html = $('html');
                    var attrs = mark.attributes;

                    if (!attrs) {
                        attrs = mark.attributes = { };
                    }

                    attrs['data-user-id'] = $html.attr('data-user-id');
                    attrs['data-user-label'] = $html.attr('data-user-label');
                    attrs['data-time'] = +new Date();
                }
            },
            link: {
                className: 'rte2-style-link',
                element: 'a',
                elementAttrAny: true, // Allow any attributes for this element
                
                // Do not allow links to span multiple lines
                singleLine: true,

                // Label to use for the dropdown
                enhancementName: 'Link',
                
                onClick: function(event, mark) {

                    var self;

                    // Note this onClick function is called in such a way that "this"
                    // refers to the Rte object, so we can access other functions in the object.
                    self = this;

                    // Stop the click from propagating up to the window
                    // because if it did, it would close the popup we will be opening.
                    if (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    }

                    // Let the user edit the link, and when that is done update the mark.
                    // Using a timeout here because we need to let the click event complete,
                    // otherwise the click outside the popup will close the popup!
                    setTimeout(function() {
                        
                        self.linkEdit(mark.attributes).done(function(attributes){

                            if (attributes.remove || attributes.href === '' || attributes.href === 'http://') {
                                // Remove the link
                                mark.clear();
                            } else {
                                // Update the link attributes
                                mark.attributes = attributes;
                            }
                        }).fail(function(){

                            // If the popup was closed without saving and there is no href already the link,
                            // then remove the link.
                            if (!mark.attributes) {
                                mark.clear();
                            }
                        });
                        
                    }, 100);

                }
            },
            ol : {
                className: 'rte2-style-ol',
                line: true,
                element: 'li',
                elementContainer: 'ol',
                clear: ['ul', 'alignLeft', 'alignCenter', 'alignRight']
            },
            ul: {
                className: 'rte2-style-ul',
                line: true,
                element: 'li',
                elementContainer: 'ul',
                clear: ['ol', 'alignLeft', 'alignCenter', 'alignRight']
            },
            alignLeft: {
                className: 'rte2-style-align-left',
                line: true,
                element: 'div',
                elementAttr: {
                    'class': 'cms-textAlign-left'
                },
                clear: ['alignCenter', 'alignRight', 'ol', 'ul']
            },
            alignCenter: {
                className: 'rte2-style-align-center',
                line: true,
                element: 'div',
                elementAttr: {
                    'class': 'cms-textAlign-center'
                },
                clear: ['alignLeft', 'alignRight', 'ol', 'ul']
            },
            alignRight: {
                className: 'rte2-style-align-right',
                line: true,
                element: 'div',
                elementAttr: {
                    'class': 'cms-textAlign-right'
                },
                clear: ['alignLeft', 'alignCenter', 'ol', 'ul']
            }
        },
        
        /**
         * Rules for cleaning up the clipboard data when content is pasted
         * from outside the RTE.
         *
         * This is an object of key/value pairs, where the key is a jQuery selector,
         * and value is one of the following:
         * {String} a style name that defines how element should be styled (refer to the "styles" parameter)
         */
        clipboardSanitizeRules: {
            
            // Note: Google docs encloses the entire document in a 'b' element so we must exclude that one
            'b[id^=docs-internal-guid]': '',
            
            // Any <b> or '<strong>' element should be treated as bold even if it has extra attributes
            // Example MSWord:  <b style="mso-bidi-font-weight:normal">
            'b': 'bold',
            'strong': 'bold',

            // Any '<i>' or '<em>' element should be treated as italic even if it has extra attributes
            // Example: <i style="mso-bidi-font-style:normal">
            'i': 'italic',
            'em': 'italic',

            // Google docs styles
            'span[style*="font-style:italic"]': 'italic',
            'span[style*="font-weight:700"]': 'bold',
            'span[style*="font-weight:bold"]': 'bold',
            'span[style*="font-weight: bold"]': 'bold',
            'span[style*="text-decoration:underline"]': 'underline',
            'span[style*="vertical-align:super"]': 'superscript',
            'span[style*="vertical-align:sub"]': 'subscript',

            // Google docs puts paragraph within list items, so eliminate it
            'li > p': '',
            
            'li[style*="list-style-type:disc"]': 'ul',
            'li[style*="list-style-type:decimal"]': 'ol',

            'p[style*="text-align: right"]': 'alignRight',
            'p[style*="text-align: center"]': 'alignCenter',
            
            'p[style*="text-align:right"]': 'alignRight',
            'p[style*="text-align:center"]': 'alignCenter',

            // MSWord 'p' elements should be treated as a new line
            // Special case if 'p' element contains only whitespace remove the whitespace
            'p[class^=Mso]': function($el) {
                var $replacement, t;
                t = $el.text() || '';
                if (t.match(/^\s*$/)) {
                    $el.text('');
                }
                $replacement = $('<span>', {'data-rte2-sanitize': 'linebreakSingle'});
                $replacement.append( $el.contents() );
                $el.replaceWith( $replacement );
            },

            // Remove attributes from table elements
            'table, tr, td, th': function($el) {
                $el.replaceWith(function () {
                    return $('<' + this.nodeName + '>').append($(this).contents());
                });
            },
            
            // Any 'p' element should be treated as a new line with a blank line after
            'p': 'linebreak'
        },


        /**
         * Which buttons are in the toolbar?
         * This is an array of toolbar config objects with the following properties:
         *
         * @property {String} style
         * The style that should be set when the toolbar link is clicked.
         * This must be a style key from the styles object.
         *
         * @property {String} text
         * The text that is displayed in the toolbar link.
         * Note the text might be hidden / replaced by an image using CSS.
         *
         * @property {String} className
         * A class to place on the toolbar link so it can be styled.
         *
         * @property {Boolean} [separator]
         * Set this and no other properties to add a separator between groups of toolbar icons.
         *
         * @property {Boolean} [inline=true]
         * Set this explicitely to false to hide a button when in "inline" mode.
         * If unset or set to true, the button will appear even in inline mode.
         *
         * @property {Boolean} [custom=false]
         * Placeholder where you want any custom CMS styles to appear in the toolbar.
         * Set this to true.
         *
         * @property {Boolean} [richTextElements=false]
         * Placeholder where you want any custom rich text elements to appear in the toolbar.
         * Set this to true
         *
         * @property {Boolean} [submenu]
         * Array of submenu items.
         *
         * @property {String} [value]
         * When using action="insert" use the "value" attribute to specify text to be inserted.
         *
         * @property {String} action
         * The name of a supported toolbar action. The following are supported:
         *
         * @property {String} action='collapse'
         * the toolbar icon will collapse a style if the cursor is within that style.
         * This can be used to collapse quotes. You must also specify the collapseStyle property.
         *
         * @property {String} action='clear'
         * Clear all styles within the range.
         *
         * @property {String} action='insert'
         * Insert text at the current selection or cursor position.
         * Specify the text using the "value" attribute.
         *
         * @property {String} action='trackChangesToggle'
         * Toggle the track changes function.
         *
         * @property {String} action='trackChangesAccept'
         * Accept any changes within the range.
         *
         * @property {String} action='trackChangesReject'
         * Accept any changes within the range.
         *
         * @property {String} action='trackChangesShowFinalToggle'
         * Toggle the track changes "show final" function.
         *
         * @example:
         * For a single icon provide the following information:
         * { style: 'bold', text: 'B', className: 'rte2-toolbar-bold' },
         *
         * @example
         *
         * To add more buttons to the toolbar for an individual target, you can add to the Rte.toolbarConfig array.
         * For example, to add some buttons for inserting special characters, run the following code before
         * the rich text editor has been created on the page:
         *
         * require(['jquery', 'v3/input/richtext2'], function($, Rte) {
         *     // Add buttons to the new rich text editor
         *     $.merge(rte2.toolbarConfig, [
         *         { separator:true },
         *         { action: 'insert', text:'em-', className: 'rte2-toolbar-insert', tooltip:'Em-dash', value:'—'},
         *         { action: 'insert', text:'…', className: 'rte2-toolbar-insert', tooltip:'Ellipsis', value:'…'}
         *     ]);
         * });
         *
         */
        toolbarConfig: [

            { style: 'bold', text: 'B', className: 'rte2-toolbar-bold', tooltip: 'Bold' },
            { style: 'italic', text: 'I', className: 'rte2-toolbar-italic', tooltip: 'Italic' },
            { style: 'underline', text: 'U', className: 'rte2-toolbar-underline', tooltip: 'Underline' },
            { style: 'strikethrough', text: 'S', className: 'rte2-toolbar-strikethrough', tooltip: 'Strikethrough' },
            { style: 'superscript', text: 'Super', className: 'rte2-toolbar-superscript', tooltip: 'Superscript' },
            { style: 'subscript', text: 'Sub', className: 'rte2-toolbar-subscript', tooltip: 'Subscript' },
            { style: 'link', text: 'Link', className: 'rte2-toolbar-link', tooltip: 'Link' },
            { style: 'html', text: 'HTML', className: 'rte2-toolbar-html', tooltip: 'Raw HTML' },
            // { action: 'caseToggleSmart', text: 'Case', className: 'rte2-toolbar-noicon', tooltip: 'Toggle upper/lowercase' },
            { action: 'clear', text: 'Clear', className: 'rte2-toolbar-clear', tooltip: 'Clear Formatting' },

            { separator:true, inline:false },
            { style: 'ul', text: '&bull;', className: 'rte2-toolbar-ul', tooltip: 'Bulleted List', inline:false },
            { style: 'ol', text: '1.', className: 'rte2-toolbar-ol', tooltip: 'Numbered List', inline:false },

            { separator:true, inline:false },
            { style: 'alignLeft', text: 'Left', className: 'rte2-toolbar-align-left', activeIfUnset:['alignCenter', 'alignRight', 'ol', 'ul'], tooltip: 'Left Align Text', inline:false },
            { style: 'alignCenter', text: 'Center', className: 'rte2-toolbar-align-center', tooltip: 'Center Align Text', inline:false },
            { style: 'alignRight', text: 'Right', className: 'rte2-toolbar-align-right', tooltip: 'Right Align Text', inline:false },

            { custom:true }, // If custom styles exist, insert a separator and custom styles here

            { separator:true, inline:false },
            { action:'enhancement', text: 'Enhancement', className: 'rte2-toolbar-enhancement', tooltip: 'Add Block Enhancement', inline:false },
            { action:'marker', text: 'Marker', className: 'rte2-toolbar-marker', tooltip: 'Add Marker', inline:false },
            { action:'table', text: 'Table', className: 'rte2-toolbar-noicon', tooltip: 'Add Table', inline:false },

            { separator:true },
            { action:'trackChangesToggle', text: 'Track Changes', className: 'rte2-toolbar-track-changes', tooltip: 'Toggle Track Changes' },
            { action:'trackChangesAccept', text: 'Accept', className: 'rte2-toolbar-track-changes-accept', tooltip: 'Accept Change' },
            { action:'trackChangesReject', text: 'Reject', className: 'rte2-toolbar-track-changes-reject', tooltip: 'Reject Change' },
            { action:'trackChangesShowFinalToggle', text: 'Show Final', className: 'rte2-toolbar-track-changes-show-final', tooltip: 'Toggle Preview' },

            { separator:true },
            { style: 'comment', text: 'Add Comment', className: 'rte2-toolbar-comment', tooltip: 'Add Comment' },
            { action: 'cleartext', text: 'Remove Comment', className: 'rte2-toolbar-comment-remove', tooltip: 'Remove Comment', cleartextStyle: 'comment' },
            { action: 'collapse', text: 'Toggle comment collapse', className: 'rte2-toolbar-comment-collapse', collapseStyle: 'comment', tooltip: 'Toggle comment collapse' },

            { separator:true },

            { action:'fullscreen', text: 'Fullscreen', className: 'rte2-toolbar-fullscreen', tooltip: 'Toggle Fullscreen Editing' },
            { action:'modeToggle', text: 'HTML', className: 'rte2-toolbar-noicon', tooltip: 'Toggle HTML Mode' },

            { richTextElements:true }

            // Example adding buttons to insert special characters or other text:
            // { text: 'Special Characters', submenu: [
            //   { action: 'insert', text:'em-', className: 'rte2-toolbar-insert', tooltip:'Em-dash', value:'—'},
            //   { action: 'insert', text:'…', className: 'rte2-toolbar-insert', tooltip:'Ellipsis', value:'…'}
            // ]}
        ],


        /**
         * Location for the toolbar to be added.
         * If this is undefined then the toolbar will be created above the editor.
         * If you provide this then the content of that element will be replaced with the toolbar.
         *
         * @type {element|selector|jQuery object}
         *
         * @example
         * <div id="mytoolbar"></div>
         *
         * rte.toolbarLocation = '#mytoolbar';
         */
        toolbarLocation: undefined,


        /**
         * If the element is a textarea of an input, should the rte add an onsubmit
         * handler to the parent form, so the element will be updated will be updated
         * before the form is submitted?
         *
         */
        doOnSubmit: true,


        /**
         * @param {Boolean} inline
         * Operate in "inline" mode?
         * This will hide certain toolbar icons such as enhancements.
         */
        inline: false,


        /**
         * Element name to use as the root context when determining if certain styles
         * are allowed to be used at the cursor position.
         * Defaults to null.
         *
         * @example
         * // Only allow the use of styles that are allowed inside the 'heading' element.
         * rte.contextRoot = 'heading';
         */
        contextRoot: null,

        
        /**
         * Initialize the rich text editor.
         *
         * @param {element|selector|jQuery object} element
         * The element for the rich text editor. This can be a textarea or input element, or a div.
         *
         * @param {Object} [options]
         * Optional options to set on the object. For example, to override the toolbarLocation parameter,
         * pass it in as an option: {toolbarLocation: mydiv}
         *
         * @example
         * rte.init('#mytextarea');
         *
         * @example
         * rte.init('#mytextarea', {toolbarLocation: '#mytoolbar'});
         */
        init: function(element, options) {

            var self;

            self = this;

            if (options) {
                $.extend(true, self, options);
            }

            // If the RTE_INIT global variable is set to a function run it.
            // This lets individual projects modify the RTE toolbar and styles.
            if ($.isFunction(window.RTE_INIT)) {
                window.RTE_INIT.call(self);
            }

            self.$el = $(element);

            // Save this object on the element so it can be accessed externally
            self.$el.data('rte2', self);

            self.initStyles();
            self.enhancementInit();
            self.inlineEnhancementInit();
            self.tableInit();
            self.initRte();
            self.toolbarInit();
            self.linkInit();
            self.trackChangesInit();
            self.placeholderInit();
            self.modeInit();
            
            // Refresh the editor after all the initialization is done.
            // We put it in a timeout to ensure the editor has displayed before doing the refresh.
            setTimeout(function(){
                self.rte.refresh();
            }, 1);
        },


        /**
         * Determine which styles to support.
         * Modify certain callback functions so the Rte object will be available via the "this" keyword.
         */
        initStyles: function() {

            var self;

            self = this;

            // Add any custom styles from teh global CSS_CLASS_GROUPS variable
            self.initStylesCustom();

            $.each(self.styles, function(i,styleObj) {

                // Modify the onClick function so it is called in the context of our object,
                // to allow the onclick function access to other RTE functions
                if (styleObj.onClick) {
                    styleObj.onClick = $.proxy(styleObj.onClick, self);
                }
            });
        },


        /**
         * Add CMS-defined styles to the rich text editor.
         * These styles come from a global variable set by the CMS.
         * These styles always apply to the entire line.
         * For example:
         *
         * var CSS_CLASS_GROUPS = [
         *   {"internalName":"MyStyles","dropDown":true,"displayName":"My Styles","cssClasses":[
         *     {"internalName":"MyStyle1","displayName":"My Style 1","tag":"H1"},
         *     {"internalName":"MyStyle2","displayName":"My Style 2","tag":"H2"}
         *   ]},
         *   {"internalName":"OtherStyles","dropDown":false,"displayName":"Other","cssClasses":[
         *     {"internalName":"Other1","displayName":"Other 1","tag":"B"},
         *     {"internalName":"Other2","displayName":"Other 2","tag":"EM"}
         *   ]}
         * ];
         */
        initStylesCustom: function() {

            var stylesCustom, self;

            self = this;

            // Add customized styles from the CMS
            if (window.CSS_CLASS_GROUPS) {

                // Load the custom CMS styles onto the page (if not already loaded)
                self.loadCMSStyles();

                // List of new style definitions
                stylesCustom = {};

                $.each(window.CSS_CLASS_GROUPS, function() {

                    var group, groupName;

                    group = this;
                    groupName = 'cms-' + group.internalName;

                    // Loop through all the styles in this group
                    $.each(group.cssClasses, function() {

                        var classConfig, cmsClassName, styleDef;

                        classConfig = this;

                        // Which class name should be used for this style?
                        // This is used to export and import the HTML
                        // For example:
                        // cms-groupInternalName-classInternalName
                        cmsClassName = groupName + '-' + classConfig.internalName;

                        // Define the custom style that will be used to export/import HTML
                        styleDef = {

                            // All custom styles will be inline (not block)
                            line:false,

                            // Classname to use for this style only within the rich text editor
                            className: cmsClassName,

                            // The HTML element and class name to output for this style
                            element: (classConfig.tag || 'span').toLowerCase(),
                            elementAttr: {
                                'class': cmsClassName
                            }
                        };

                        // Add the style definition to our master list of styles
                        // For example, at the end of this you might have something like the following:
                        //
                        // self.styles['rte2-style-cms-MyStyles-MyStyle1'] = {
                        //   line:true,
                        //   className: 'rte2-style-cms-MyStyles-MyStyle1',
                        //   element: 'h1',
                        //   class: 'cms-MyStyles-MyStyle1'
                        // }
                        //
                        // And that should output HTML like the following:
                        // <h1 class="cms-MyStyles-MyStyle1">text here</h1>

                        stylesCustom[ cmsClassName ] = styleDef;

                    }); // each group.cssClasses
                }); // each window.CSS_CLASS_GROUPS

                // Create a new styles definition, with custom styles listed first
                self.styles = $.extend(true, {}, stylesCustom, self.styles);

            } // if window.CSS_CLASS_GROUPS
        },


        /**
         * Initialize the rich text editor.
         */
        initRte: function() {

            var content, self;

            self = this;

            // Get the value from the textarea
            content = self.$el.val() || '';

            // Create the codemirror rich text editor object
            self.rte = Object.create(CodeMirrorRte);

            // Add our styles to the styles that are already built into the rich text editor
            self.rte.styles = $.extend(true, {}, self.rte.styles, self.styles);

            // Add our clipboard sanitize rules
            self.rte.clipboardSanitizeRules = $.extend(true, {}, self.rte.clipboardSanitizeRules, self.clipboardSanitizeRules);

            // Create a div under the text area to display the toolbar and the editor
            self.$container = $('<div/>', {
                'class': 'rte2-wrapper'
            }).insertAfter(self.$el);

            // Also save this object on the wrapper so it can be accessed externally
            // This is useful for when the external code doesn't know the self.$el (textarea)
            self.$container.data('rte2', self);

            self.$editor = $('<div/>', {'class':'rte2-codemirror'}).appendTo(self.$container);

            // Move textarea after the editor
            self.$el.appendTo(self.$container);
            
            // Since the rte will trigger special events on the container,
            // we should catch them and pass them to the textarea
            self.$editor.on('rteFocus', function(){
                self.$el.trigger('rteFocus', [self]);
                return false;
            });
            self.$editor.on('rteBlur', function(){
                self.$el.trigger('rteBlur', [self]);
                return false;
            });
            self.$editor.on('rteChange', function(){
                self.$el.trigger('rteChange', [self]);
                return false;
            });
            
            // Hide the textarea
            self.$el.hide();

            // Set up a submit event on the form to copy the value back into the textarea
            if (self.doOnSubmit) {

                self.$el.closest('form').on('submit', function(){
                    if (self.rte.modeGet() === 'rich' && !self.rte.readOnlyGet() && self.changed) {
                        self.trackChangesSave();
                        self.$el.val(self.toHTML());
                    }
                });
            }

            // Initialize the editor
            self.rte.init(self.$editor);

            // Set to read only mode if necessary
            self.rte.readOnlySet( self.$el.closest('.inputContainer-readOnly').length );
            
            // Override the rich text editor to tell it how enhancements should be imported from HTML
            self.rte.enhancementFromHTML = function($content, line) {

                self.enhancementFromHTML($content, line);
            };

            // Set the content into the editor
            self.rte.fromHTML(content);

            // Adding HTML to the editor tends to create multiple undo history events,
            // so clear the history to start.
            self.rte.historyClear();

            // Set up an event listener to mark the content as "changed".
            //
            // This is because in some cases if the input HTML is transformed when parsing,
            // we don't want to mark the content as changed unless the user specifically modifies
            // the content.
            //
            // Note we do this after a short timeout because the editor's change events
            // are debounced, and we need to give the editor time to add the initial
            // content before we start listening for change events.
            
            self.changed = false;
            setTimeout(function() {
                self.$editor.on('rteChange', function(){
                    self.changed = true;
                });
            }, 1000);

            // Set up periodic update of the textarea
            self.previewInit();
        },


        /**
         * Load the custom CMS styles onto the page if they are not already present.
         */
        loadCMSStyles: function() {
            var self;
            self = this;

            // Check the private variable customStylesLoaded to determine if the styles have already been loaded
            // If there are multiple rich text editors on the page we only want to load the styles once
            if (window.CSS_CLASS_GROUPS && !customStylesLoaded) {

                customStylesLoaded = true;

                // Loading the style rules via ajax to ensure it is not cached
                // so we have the latest styles as set in the CMS settings
                $.ajax({
                    'url': CONTEXT_PATH + '/style/v3/rte2-cms-styles.jsp',
                    'cache': false,
                    'async': false,
                    'success': function(rules) {
                        $('<style>' + rules + '</style>').appendTo('head');
                    }
                });
            }
        },

        /*==================================================
         * Full Screen Mode
         *==================================================*/

        /**
         * Toggle fullscreen mode.
         */
        fullscreenToggle: function() {

            var self;

            self = this;

            // Hide or show some parts of the page
            $('.toolBroadcast').toggle();
            $('.toolHeader').toggle();

            // Add classname to change display
            $('body').toggleClass('rte-fullscreen');
            self.$container.toggleClass('rte-fullscreen');
            
            // Also kick the editor
            self.rte.refresh();
        },

        
        /**
         * @returns {Boolean}
         */
        fullscreenIsActive: function() {
            return $('body').hasClass('rte-fullscreen');
        },

        
        /*==================================================
         * Mode plain or rich
         *==================================================*/
        
        modeInit: function() {
            var self = this;
            
            self.$container.on('rteModeChange', function(event, mode) {
                if (mode === 'plain') {
                    self.modeSetPlain();
                } else {
                    self.modeSetRich();
                }
            });
        },

        
        modeSetPlain: function() {
            var self = this;

            // Mark this as a change
            self.rte.triggerChange();
            
            self.$el.val(self.rte.toHTML());
            
            self.$el.show();
            
            // Trigger a resize event on the window so the textarea will get resized
            $(window).resize();
        },

        
        modeSetRich: function() {
            var self = this;
            var rte = self.rte;
            var trackIsOn = rte.trackIsOn();
            
            // Mark this as a change
            self.rte.triggerChange();
            
            self.$el.hide();

            // Turn off track changes when converting from plain to rich text
            // to avoid everything being marked as a change
            rte.trackSet(false);

            rte.fromHTML(self.$el.val());
            
            // Turn track changes back on (if it was on)
            rte.trackSet(trackIsOn);
        },

        
        /*==================================================
         * Track Changes
         * Code to save and restor the state of "track changes" for an individual rich text editor.
         * Creates values in sessionStorage like the following:
         * {"bsp.rte.changesTracking.0000014c-7163-dcad-a14c-f1e7df5b0000/body": "1"}
         *==================================================*/

        /**
         * On starting the rich text editor, restore previous "track changes" setting.
         */
        trackChangesInit: function() {
            var self;
            self = this;
            self.trackChangesRestore();
        },

        
        /**
         * Save the current track changes status.
         * This will normally be saved only when the user submits the form.
         */
        trackChangesSave: function() {
            
            var name, self, state;

            self = this;

            name = self.trackChangesGetName();
            if (name) {

                // Delete any existing setting in session storage
                window.sessionStorage.removeItem(name);

                state = self.rte.trackIsOn();
                if (state) {
                    // Track changes is on so save
                    window.sessionStorage.setItem(name, '1');
                }
            }
        },

        
        /**
         *  Restore the track changes status.
         */
        trackChangesRestore: function() {
            
            var name, self;

            self = this;

            name = self.trackChangesGetName();
            if (name && window.sessionStorage.getItem(name)) {
                // Turn on track changes
                self.rte.trackSet(true);
                self.toolbarUpdate();
            }
        },

        
        /**
         * Return the sessions storage name that can be used
         * to save the state for this particular input.
         */
        trackChangesGetName: function() {
            
            var name, self;
            
            self = this;
            
            name = self.$el.closest('.inputContainer').attr('data-name') || '';
            
            if (name) {
                name = 'bsp.rte.changesTracking.' + name;
            }
            
            return name;
        },

        
        /*==================================================
         * TOOLBAR
         *==================================================*/

        toolbarInit: function() {

            var self, $toolbar;

            self = this;

            // Set up the toolbar container
            $toolbar = $('<ul/>', {'class': 'rte2-toolbar'});
            if (self.toolbarLocation) {
                $toolbar.appendTo(self.toolbarLocation);
            } else {
                $toolbar.insertBefore(self.$editor);
            }
            self.$toolbar = $toolbar;

            // If in read only mode hide the toolbar.
            // Note there is no way to switch from read only to editable at this time.
            if (self.rte.readOnlyGet()) {
                self.$toolbar.hide();
            }

            // Recursive function for setting up toolbar menu and submenus
            function toolbarProcess(config, $toolbar) {
                
                var $submenu;

                // Loop through the toolbar config to set up buttons
                $.each(config, function(i, item) {

                    // Skip inline toolbar items if this is an inline editor
                    if (self.inline && item.inline === false) {
                        return;
                    }

                    if (item.separator) {

                        // Add a separator between items
                        self.toolbarAddSeparator($toolbar);

                    } else if (item.submenu) {

                        // This is a submenu
                        // {submenu:true, text:'', style:'', className:'', submenuItems:[]}
                        $submenu = self.toolbarAddSubmenu(item, $toolbar);
                        
                        toolbarProcess(item.submenu, $submenu);

                    } else if (item.custom) {

                        self.toolbarInitCustom($toolbar);

                    } else if (item.richTextElements) {

                        self.toolbarInitRichTextElements($toolbar);

                    } else {

                        self.toolbarAddButton(item, $toolbar);

                    }
                });
            }

            // Process all the toolbar entries
            toolbarProcess(self.toolbarConfig, $toolbar);

            // Whenever the cursor moves, update the toolbar to show which styles are selected
            self.$container.on("rteCursorActivity",
                               $.debounce(200, function() {
                                   self.toolbarUpdate();
                               })
                              );

            self.toolbarUpdate();
        },


        /**
         * Set up custom styles that were specified in the CMS.
         * These styles come from a global variable set by the CMS.
         * For example:
         *
         * var CSS_CLASS_GROUPS = [
         *   {"internalName":"PatStylesInternal","dropDown":true,"displayName":"PatStyles","cssClasses":[
         *     {"internalName":"PatStyle1Internal","displayName":"PatStyle1","tag":"EM"},
         *     {"internalName":"PatStyle2Internal","displayName":"PatStyle2","tag":"STRONG"}
         *   ]},
         *   {"internalName":"PatStyles2Internal","dropDown":false,"displayName":"PatStyles2","cssClasses":[
         *     {"internalName":"PatStyle2-1Internal","displayName":"PatStyle2-1","tag":"B"},
         *     {"internalName":"PatStyle2-2Internal","displayName":"PatStyle2-2","tag":"EM"}
         *   ]}
         * ];
         */
        toolbarInitCustom: function($toolbar) {

            var self = this;

            if (!window.CSS_CLASS_GROUPS || window.CSS_CLASS_GROUPS.length === 0) {
                return;
            }

            self.toolbarAddSeparator($toolbar);

            $.each(window.CSS_CLASS_GROUPS, function() {

                var group, groupName, $submenu;

                group = this;
                groupName = 'cms-' + group.internalName;

                // Should the buttons be placed directly in the toolbar are in a drop-down menu?
                $submenu = $toolbar;
                if (group.dropDown) {
                    $submenu = self.toolbarAddSubmenu({text:group.displayName}, $toolbar);
                }

                // Loop through all the styles in this group
                $.each(group.cssClasses, function() {

                    var classConfig, cmsClassName, toolbarItem;

                    classConfig = this;

                    // Which class name should be used for this style?
                    // This is used to export and import the HTML
                    // For example:
                    // cms-groupInternalName-classInternalName
                    cmsClassName = groupName + '-' + classConfig.internalName;

                    // Configure the toolbar button
                    toolbarItem = {
                        style: cmsClassName, // The style definition that will be applied
                        text: classConfig.displayName, // Text for the toolbar button
                        className: 'rte2-toolbar-custom' // Class used to style the toolbar button
                    };

                    // Create a toolbar button to apply the style
                    self.toolbarAddButton(toolbarItem, $submenu);
                });
            });
        },


        /**
         * Determine if any global RICH_TEXT_ELEMENTS have been defined and should
         * be added to the toolbar.
         *
         * @param {jQuery} $toolbar
         * The main toolbar for the RTE.
         */
        toolbarInitRichTextElements: function ($toolbar) {
            
            if (!window.RICH_TEXT_ELEMENTS || RICH_TEXT_ELEMENTS.length === 0) {
                return;
            }

            var self = this;

            self.toolbarAddSeparator($toolbar);

            var tags = self.richTextElementTags;
            var submenus = { };

            $.each(RICH_TEXT_ELEMENTS, function (index, rtElement) {

                // For this instance of the RTE, was there a custom list
                // of elements that should be displayed in the toolbar?
                if (tags && tags.indexOf(rtElement.tag) < 0) {
                    
                    // Skip this element if it is not listed in the allowed elements
                    return;
                }

                // Always skip TR and TD elements, because those are used
                // only to specify context and attributes, but should not
                // appear in the toolbar
                if (rtElement.tag === 'tr' || rtElement.tag === 'td') {
                    return;
                }
                
                var styleName = rtElement.styleName;
                var submenuName = rtElement.submenu;
                var submenu;
                var toolbarButton;

                toolbarButton = {
                    className: 'rte2-toolbar-noicon rte2-toolbar-' + styleName,
                    style: styleName,
                    text: rtElement.displayName,
                    tooltip: rtElement.tooltipText
                };

                // Special case - the table element is treated as a toolbar action instead of a style
                if (rtElement.tag === 'table') {
                    toolbarButton.action = 'table';
                }

                if (submenuName) {
                    submenu = submenus[submenuName];

                    if (!submenu) {
                        submenu = [ ];
                        submenus[submenuName] = submenu;
                    }

                    submenu.push(toolbarButton);

                } else {
                    self.toolbarAddButton(toolbarButton, $toolbar);
                }
            });

            $.each(submenus, function (text, submenuItems) {
                var $submenu;
                $submenu = self.toolbarAddSubmenu({text: text}, $toolbar);
                $.each(submenuItems, function(i, item) {
                    self.toolbarAddButton(item, $submenu);
                });
            });
        },


        /**
         * Add a submenu to the toolbar.
         *
         * @param {Object} item
         * The toolbar item to add.
         * @param {Object} item.className
         * @param {Object} item.text
         *
         * @param {Object} [$addToSubmenu]
         * Optional submenu where the submenu should be added.
         * If omitted, the submenu is added to the top level of the toolbar.
         *
         * @returns {jQuery}
         * The submenu element where additional buttons can be added.
         */
        toolbarAddSubmenu: function(item, $addToSubmenu) {

            var self = this;
            var $toolbar = $addToSubmenu || self.$toolbar;
            var $submenu;

            $submenu = $('<li class="rte2-toolbar-submenu ' + (item.className || '') + '"><span></span><ul></ul></li>');
            $submenu.find('span').html(item.text);
            $submenu.appendTo($toolbar);

            return $submenu.find('ul');
        },


        /**
         * Add a button to the toolbar (or to a submenu in the toolbar).
         *
         * @param {Object} item
         * The toolbar item to add.
         * @param {Object} item.className
         * @param {Object} item.text
         * @param {Object} item.tooltip
         *
         * @param {Object} [$submenu]
         * Optional submenu where the button should be added.
         * If omitted, the button is added to the top level of the toolbar.
         * If provided this should be the value that was returned by toolbarAddSubmenu()
         */
        toolbarAddButton: function(item, $submenu) {

            var self = this;
            var $toolbar = $submenu || self.$toolbar;
            var $button;

            // This is a toolbar button
            $button = $('<a/>', {
                href: '#',
                'class': item.className || '',
                html: item.text || '',
                title: item.tooltip || '',
                data: {
                    toolbarConfig:item
                }
            });

            $button.on('click', function(event) {
                event.preventDefault();
                self.toolbarHandleClick(item, event);
            });

            $('<li/>').append($button).appendTo($toolbar);
        },



        /**
         * Add a button to the toolbar (or to a submenu in the toolbar).
         *
         * @param {Object} [$submenu]
         * Optional submenu where the button should be added.
         * If omitted, the button is added to the top level of the toolbar.
         * If provided this should be the value that was returned by toolbarAddSubmenu()
         */
        toolbarAddSeparator: function($submenu) {

            var self = this;
            var $toolbar = $submenu || self.$toolbar;

            $('<li/>', {
                'class': 'rte2-toolbar-separator'
            }).appendTo($toolbar);
        },


        /**
         * When user clicks a toolbar item, do somehting.
         * In general this toggles the style associated with the item,
         * but it can also do more based on the "action" parameter
         * in the toolbar config.
         *
         * @param {Object} item
         * An entry from the toolbarConfig object.
         *
         * @param {Object} [event]
         * The click event that from the toolbar button.
         * In case you need to stop the click from propagating.
         */
        toolbarHandleClick: function(item, event) {

            var $button, mark, marks, rte, self, styleObj, value;

            self = this;

            // Don't do the click if the button is not allowed in the current context
            $button = $(event.target);
            if ($button.hasClass('outOfContext')) {
                return;
            }
            
            rte = self.rte;

            styleObj = self.rte.styles[item.style] || {};

            if (item.action) {

                switch (item.action) {

                case 'caseToggleSmart':
                    rte.caseToggleSmart();
                    break;
                    
                case 'caseToLower':
                    rte.caseToLower();
                    break;

                case 'caseToUpper':
                    rte.caseToUpper();
                    break;

                case 'clear':
                    rte.removeStyles();
                    break;

                case 'cleartext':
                    if (item.cleartextStyle) {
                        rte.inlineRemoveStyledText(item.cleartextStyle);
                    }
                    break;

                case 'collapse':
                    if (item.collapseStyle) {
                        rte.inlineToggleCollapse(item.collapseStyle);
                    }
                    break;

                case 'enhancement':

                    // Stop the event from propagating, otherwise it will close the enhancement popup
                    event.stopPropagation();
                    event.preventDefault();

                    // Before creating a new enhancement via the toolbar, move the cursor to the start of a non-blank line
                    rte.moveToNonBlank();
                    
                    self.enhancementCreate();
                    break;

                case 'table':
                    self.tableCreate();
                    break;
                    
                case 'fullscreen':
                    self.fullscreenToggle();
                    break;
                    
                case 'insert':
                    if (item.value) {
                        // Write value to the DOM and read it back again,
                        // to convert any entities to a character code
                        value = $('<div>').html(item.value).text();
                        rte.insert(value);
                    }
                    break;
                    
                case 'marker':

                    // Stop the event from propagating, otherwise it will close the enhancement popup
                    event.stopPropagation();
                    event.preventDefault();

                    self.enhancementCreate({marker:true});
                    break;

                case 'trackChangesToggle':
                    rte.trackToggle();
                    break;

                case 'trackChangesAccept':
                    rte.trackAcceptRange();
                    break;

                case 'trackChangesReject':
                    rte.trackRejectRange();
                    break;

                case 'trackChangesShowFinalToggle':
                    rte.trackDisplayToggle();
                    break;

                case 'find':
                    rte.focus();
                    rte.find();
                    return; // return so we don't run rte.focus() again
                    break;

                case 'replace':
                    rte.focus();
                    rte.replace();
                    return; // return so we don't run rte.focus() again

                case 'modeToggle':
                    rte.modeToggle();
                    break;
                }

            } else if (styleObj.enhancementType) {

                // Stop the event from propagating, otherwise it will close the enhancement popup
                event.stopPropagation();
                event.preventDefault();

                var initialBody = styleObj.initialBody;

                if (initialBody) {
                    mark = rte.insert(initialBody, item.style);
                    if (mark) {
                        self.inlineEnhancementHandleClick(event, mark);
                    }

                } else if (styleObj.toggle) {

                    // Check to see if we need to toggle off
                    mark = rte.toggleStyle(item.style);
                    if (mark) {
                        self.inlineEnhancementHandleClick(event, mark);
                    }

                } else {
                    self.inlineEnhancementCreate(event, item.style);
                }

            } else if (item.style) {

                if (styleObj.onClick) {

                    // Find all the marks in the current selection that have onclick
                    marks = self.rte.dropdownGetMarks(true);

                    // Exclude marks that are not for the style we are currently examining
                    marks = $.map(marks, function(mark){
                        if (mark.className === styleObj.className) {
                            return mark;
                        } else {
                            return null;
                        }
                    });

                    if (marks.length) {
                        styleObj.onClick(event, marks[0]);
                    } else {
                        // Create a new mark then call the onclick function on it
                        mark = rte.setStyle(item.style);
                        if (mark) {
                            styleObj.onClick(event, mark);
                        }
                    }

                } else {
                    mark = rte.toggleStyle(item.style);

                    if (mark && styleObj.onCreate) {
                        styleObj.onCreate(mark);
                    }
                }
            }

            // Certain styles like comments look strange when there are two
            // adjacent marks, so combine adjacent marks if possible.
            rte.inlineCombineAdjacentMarks();
            
            // Update the toolbar so it makes the buttons active or inactive
            // based on the cursor position or selection
            self.toolbarUpdate();

            self.$container.resize();

            // Focus back on the editor
            self.focus();
        },


        /**
         * Update the active status of the toolbar icons based on the current editor position.
         */
        toolbarUpdate: function() {

            var contextArray, $links, mode, rte, self, styles;

            self = this;
            rte = self.rte;

            // Get the mode of the editor ('plain' or 'rich')
            mode = rte.modeGet();

            // Show or hide toolbar buttons based on the mode
            // Show them all if 'rich' mode, otherwise hide them.
            // Later we will show certain actions for 'plain' mode.
            self.$toolbar.children('li').toggle(mode === 'rich');
            
            // First make all the buttons inactive,
            // Then we'll decide which need to be active
            $links = self.$toolbar.find('a');
            $links.removeClass('active');
            self.$toolbar.find('.rte2-toolbar-submenu').removeClass('active');

            // Get all the styles defined on the current range
            // Note ALL characters in the range must have the style or it won't be returned
            styles = $.extend({}, rte.inlineGetStyles(), rte.blockGetStyles());

            // Get all the context elements for the currently selected range of characters
            context = rte.getContext();
            
            // Go through each link in the toolbar and see if the style is defined
            $links.each(function(){

                var activeElements, allRoot, config, $link, makeActive, styleObj;

                $link = $(this);

                // Get the toolbar config object (added to the link when the link was created in toolbarInit()
                config = $link.data('toolbarConfig');
                if (!config) {
                    return;
                }
                
                // For toolbar actions we need special logic to determine if the button should be "active"
                // One exception is for inline enhancements, which are treated as a normal style
                if (config.action && config.action !== 'enhancementInline' && config.action !== 'table') {

                    switch (config.action) {

                    case 'trackChangesToggle':
                        $link.toggleClass('active', rte.trackIsOn());
                        break;

                    case 'trackChangesAccept':
                    case 'trackChangesReject':
                        if (styles.hasOwnProperty('trackInsert') || styles.hasOwnProperty('trackDelete')) {
                            $link.addClass('active');
                        }
                        break;

                    case 'trackChangesShowFinalToggle':
                        $link.toggleClass('active', !rte.trackDisplayGet());
                        break;

                    case 'fullscreen':
                        
                        // Make the button active if in fullscreen  mode
                        $link.toggleClass('active', self.fullscreenIsActive());
                        
                        // Always show this button when in rich or plain mode
                        $link.parent().show();
                        break;
                        
                    case 'modeToggle':
                        // Make the button active if in 'plain' mode
                        // And always show the button
                        $link.toggleClass('active', mode === 'plain');
                        $link.parent().show();
                        break;
                        
                    } // switch

                } else {

                    // Check if the style for this toolbar item is defined for ALL characters in the range
                    if (config.style && styles[config.style] === true) {

                        $link.addClass('active');

                        // If the link is inside a submenu, mark the submenu as active also
                        $link.closest('.rte2-toolbar-submenu').addClass('active');

                    }

                    // Special case if we have a toolbar icon that should be active when another set of
                    // styles are unset, then check for that here.
                    // For example, this can be used to make "Align Left" appear active unless some other styles
                    // such as "Align Center" or "Align Right" are set.
                    if (config.activeIfUnset) {
                        makeActive = true;
                        $.each(config.activeIfUnset, function(i, style) {
                            if (styles.hasOwnProperty(style)) {
                                makeActive = false;
                            }
                        });
                        if (makeActive) {
                            $link.addClass('active');
                        }

                    }

                    // Special case if the toolbar style should only be displayed in certain contexts
                    styleObj = self.styles[config.style] || {};
                    $link.removeClass('outOfContext');

                    // Special case for the "Table" button, we will look for a style
                    // definition for the "table" element, to see if it has any
                    // context specified
                    if (config.action === 'table' && self.tableStyleTable) {
                        styleObj = self.tableStyleTable;
                    }

                    if (styleObj.context) {
                        
                        // Loop through all the current contexts.
                        // Note there can be multiple contexts because multiple characters can be
                        // selected in the range, and each character might be in a different context.
                        // For example, if the character R represents the selected range:
                        // aaa<B>RRR</B>RRR<I>RRR</I>aaa
                        // Then the context would be B, I, and null.
                        //
                        // We must check each context that is selected, to determine if
                        // the style is allowed in that context.
                        //
                        // If the style fails for any one of the contexts, then it
                        // should be invalid, and we should prevent the user from applying the style
                        // across the range.

                        // Loop through all the contexts for the selected range
                        validContext = true;
                        $.each(context, function(i, contextElement) {

                            // If a different root context was specified, then use that as the root element
                            // For example, if the rte is meant to edit the content inside a '<mycontent>' element,
                            // then contextRoot would be 'mycontent', and only those elements allowed in that element
                            // would be allowed.
                            if (self.contextRoot && contextElement === null) {
                                contextElement = self.contextRoot;
                            }

                            // Is this contextElement listed among the context allowed by the current style?
                            if ($.inArray(contextElement, styleObj.context) === -1) {
                                validContext = false;
                                return false; // stop looping
                            }
                        });

                        // Set a class on the toolbar button to indicate we are out of context.
                        // That class will be used to style the button, but also
                        // to prevent clicking on the button.
                        $link.toggleClass('outOfContext', !validContext);
                    }
                    
                }
            });

            return;
        },


        toolbarToggle: function() {
            var self;
            self = this;
            self.$toolbar.toggle();
        },


        toolbarShow: function() {
            var self;
            self = this;
            self.$toolbar.show();
        },


        toolbarHide: function() {
            var self;
            self = this;
            self.$toolbar.hide();
        },


        /*==================================================
         * LINKS
         *==================================================*/

        /**
         * Sets up the pop-up form that will be used to edit links.
         * This is called only once when the editor is initialized.
         */
        linkInit: function() {

            var self;

            self = this;

            // The pop-up dialog used to prompt for links
            self.$linkDialog = $(
                '<div>' +
                    '<h2>Link</h2>' +
                    '<div class="rte2-dialogLine">' +
                        '<input type="text" class="rte2-dialogLinkHref">' +
                        '<input type="hidden" class="rte2-dialogLinkId">' +
                        '<a class="rte2-dialogLinkContent" target="linkById" href="' + CONTEXT_PATH + '/content/linkById.jsp?p=true">Content</a>' +
                    '</div>' +
                    '<div class="rte2-dialogLine">' +
                        '<select class="rte2-dialogLinkTarget">' +
                            '<option value="">Same Window</option>' +
                            '<option value="_blank">New Window</option>' +
                        '</select>' +
                        '<select class="rte2-dialogLinkRel">' +
                            '<option value="">Relation</option>' +
                            '<option value="nofollow">nofollow</option>' +
                        '</select>' +
                    '</div>' +
                    '<a class="rte2-dialogLinkSave">Save</a>' +
                    '<a class="rte2-dialogLinkOpen" target="_blank">Open</a>' +
                    '<a class="rte2-dialogLinkUnlink">Unlink</a>' +
                '</div>'
            ).on('click', '.rte2-dialogLinkSave', function() {
                // User clicked "Save" button to save the link
                self.linkSave();
                self.$linkDialog.popup('close');
                return false;
            }).on('click', '.rte2-dialogLinkUnlink', function() {
                // User clicked "Unlink" button to remove the link
                self.linkUnlink();
                self.$linkDialog.popup('close');
                return false;
            }).on('input', '.rte2-dialogLinkHref', function(event) {
                // User changed the link href, so update the href in the "Open" link
                self.$linkDialog.find('.rte2-dialogLinkOpen').attr('href', $(event.target).val() );
            }).on('keydown', '.rte2-dialogLinkHref', function(event) {
                // If user presses enter key save the dialog
                if (event.which === 13) {
                    self.linkSave();
                    self.$linkDialog.popup('close');
                    return false;
                }
            }).appendTo(document.body)
                .popup({parent:self.$container}) // turn it into a popup
                .popup('close') // but initially close the popup
                .popup('container').on('close', function() {
                    // If the popup is canceled with Esc or otherwise,
                    // do some cleanup such as removing the link if no link was
                    // previously selected
                    self.linkClose();
                });

        },


        /**
         * Displays a pop-up form to let users choose or edit a link.
         *
         * @param {Object} [attributes]
         * An object with key/value pairs for the link data.
         * @param {String} [attributes.href]
         * @param {String} [attributes.target]
         * @param {String} [attributes.rel]
         * @param {String} [attributes.title]
         * @param {String} [attributes.cmsId]
         * @param {String} [attributes.cmsHref]
         *
         * @returns {Promise}
         * Returns a promise that will be resolved with the link data
         * {Object} promise(attributes)
         * @param {String} [attributes.href]
         * @param {String} [attributes.target]
         * @param {String} [attributes.rel]
         * @param {String} [attributes.title]
         * @param {String} [attributes.cmsId]
         * @param {String} [attributes.cmsHref]
         * @param {Boolean} [attributes.remove]
         * If this is true, then remove the link.
         */
        linkEdit: function(attributes) {

            var deferred, $linkDialog, $href, self;

            self = this;

            attributes = attributes || {};

            $linkDialog = self.$linkDialog;

            deferred = $.Deferred();

            // Open the popup
            $linkDialog.popup('open');

            // Add existing attributes to the popup form
            $href = $linkDialog.find('.rte2-dialogLinkHref');
            $href.val(attributes.href || 'http://');
            $linkDialog.find('.rte2-dialogLinkId').val(attributes.cmsId || '');
            $linkDialog.find('.rte2-dialogLinkTarget').val(attributes.target || '');
            $linkDialog.find('.rte2-dialogLinkRel').val(attributes.rel || '');
            $linkDialog.find('.rte2-dialogLinkOpen').attr('href', $href.val());
            $href.focus();

            // Save the deferred object so we can resolve it later
            self.linkDeferred = deferred;

            return deferred.promise();
        },


        /**
         * Used by the link dialog, this function gets the values from the dialog
         * then resolves the deferred object so we can complete editing the link.
         */
        linkSave: function() {

            var attributes, $linkDialog, self;
            var href, rel, target, title, cmsId;

            self = this;

            $linkDialog = self.$linkDialog;

            href = $linkDialog.find('.rte2-dialogLinkHref').val() || '';
            target = $linkDialog.find('.rte2-dialogLinkTarget').val() || '';
            rel = $linkDialog.find('.rte2-dialogLinkRel').val() || '';
            cmsId = $linkDialog.find('.rte2-dialogLinkId').val() || '';
            
            attributes = {};
            attributes.href = href;

            if (target) {
                attributes.target = $linkDialog.find('.rte2-dialogLinkTarget').val() || '';
            }

            if (rel) {
                attributes.rel = $linkDialog.find('.rte2-dialogLinkRel').val() || '';
            }

            if (cmsId) {
                attributes['data-cms-id'] = cmsId;
                attributes['data-cms-href'] = href;
            }

            // Resolve the deferred object with the new attributes,
            // so whoever called linkEdit will be notified with the final results.
            self.linkDeferred.resolve(attributes);
        },


        /**
         * Used by the link dialog, this function resolves the deferred object
         * so we can complete editing the link (and remove the link).
         */
        linkUnlink: function() {
            var self;
            self = this;
            self.linkDeferred.resolve({remove:true});
        },


        /**
         * This function is called when the edit popup closes
         * whether from user input clicking outside the popup.
         */
        linkClose: function() {

            var self;

            self = this;

            // Reject the deferred object (if it hasn't already been resolved)
            if (self.linkDeferred) {
                self.linkDeferred.reject();
            }
        },


        /*==================================================
         * Enhancements and Markers
         *
         * Enhancements are bits of external content that sit within the editor content.
         * Users can do the following to the enhancement:
         * Create (and select an enhancement object in a popup)
         * Remove (mark for removal)
         * Remove completely (if already marked for removal)
         * Change (select the enhancement object)
         * Edit (modify the enhancement object in a popup)
         * Move up / down
         * Float left / right / full line
         * Set image size
         *
         * Markers are similar to enhancements, but they do not have external content,
         * they just represent things like page breaks, etc.
         *
         * Enhancements and markers are output in the HTML as a BUTTON element:
         * <button class="enhancement"/>
         * <button class="enhancement marker"/>
         *
         * However, in the the HTML that the rich text editor receives, instead
         * of a BUTTON element we receive a SPAN element.
         *
         * The element has several data elements:
         *
         * data-reference
         * A JSON string that contains information about the enhancement or marker.
         *
         * data-alignment
         * If this exists, "left" will float the enhancement left, "right" will float right.
         *
         * data-preview
         * If this exists, it contains a thumbnail URL for a preview image.
         *==================================================*/

        /**
         */
        enhancementInit: function() {

            var self;

            self = this;

            // Counter to generate unique link targets for enhancement toolbar links
            self.enhancementGetTargetCounter = 0;

            // Okay, this is a hack so prepare yourself.
            // Set up a global click event to detect when user clicks on an enhancement in the popup.
            // However, since there can be multiple enhancements in the editor,
            // (and multiple rich text editors on the page) we must determine where the popup originated.
            // If the popup did not originate in our rich text editor, we will ignore the event and let
            // somebody else deal with it.
            $(document.body).on('click', '[data-enhancement]', function(event) {

                var data, $enhancement, $popupTrigger, $target;

                // The enhancement link that the user clicked
                $target = $(this);

                // Get the link that triggered the popup to appear.
                // This link will be inside the enhancement that is being changed.
                $popupTrigger = $target.popup('source');

                // Determine if that link is inside our rich text editor
                if (!self.$container.find($popupTrigger).length) {
                    // Not in our editor - must be from some other editor so we will ignore
                    return;
                }

                // Get the enhancement that is being changed.
                $enhancement = self.enhancementGetWrapper($popupTrigger);

                // Get the data for the selected enhancement
                // Note the .data() function will automatically convert from JSON string to a javacript object.
                // For example, the link might look like this:
                // <a data-enhancement='{"label":"Test Raw HTML","record":{"_ref":"0000014d-018f-da9a-a5cf-4fef59b30000",
                // "_type":"0000014b-75ea-d559-a95f-fdffd32f005f"},"_id":"0000014d-590f-d32d-abed-fdef3ad50001",
                // "_type":"0000014b-75ea-d559-a95f-fdffd3300055"}' href="#">Test Raw HTML</a>
                data = $target.data('enhancement');

                // Save the data on the enhancement so it can be used later
                self.enhancementSetReference($enhancement, data);

                // Close the popup - this will also trigger the enhancement display to be updated (see 'close' event below)
                $target.popup('close');
                
                // Put focus back on the editor
                self.focus();

                event.preventDefault();
                event.stopImmediatePropagation();
                return false;
            });


            // Set up a global close event to determine when the enhancement popup is closed
            // so we can update the enhancement display (or remove the enhancement)
            $(document.body).on('close', '.popup[name^="contentEnhancement-"]', function() {

                var $enhancement, $popupTrigger, $popup;

                // The popup that was closed
                $popup = $(this);

                // Get the link that triggered the popup to appear.
                // This link will be inside the enhancement that is being changed.
                $popupTrigger = $popup.popup('source');

                // Determine if that link is inside our rich text editor
                if (!self.$container.find($popupTrigger).length) {
                    // Not in our editor - must be from some other editor so we will ignore
                    return;
                }

                // Get the enhancement that is being changed.
                $enhancement = self.enhancementGetWrapper($popupTrigger);

                // Update the enhancement to show a preview of the content.
                // This will also remove the enhancement if it is empty.
                self.enhancementUpdate($enhancement);
                
            });
        },


        /**
         * Create a new enhancement or marker.
         *
         * @param {Object} [config]
         * Optional data for the enhancement.
         *
         * @param {Object} [config.reference]
         *
         * @param {String} [config.alignment]
         * The alignment for the enhancement: blank, "left", or "right"
         *
         * @param {Boolean} [config.marker]
         * Set to true if this is a marker, or omit if this is an enhancement.
         *
         * @param {Number} [line=current line]
         * Optional line number to insert the enhancement.
         * Omit to insert the enhancement at the current cursor position.
         */
        enhancementCreate: function(config, line) {

            var $enhancement, mark, self;

            self = this;

            config = config || {};

            // Create wrapper element for the enhancement and add the toolbar
            $enhancement = $('<div/>', {
                'class': 'rte2-enhancement'
            });

            // If in read only mode do not create toolbar.
            // Note there is no way to switch from read only to editable at this time.
            if (!self.rte.readOnlyGet()) {
                $enhancement.append( self.enhancementToolbarCreate(config) );
            }

            if (config.marker) {
                $enhancement.addClass('rte2-marker');
            }

            // Clicking on the enhancement should focus back on the editor
            // and place the cursor at the start of the line that contains the enhancement
            $enhancement.on('click', function(){
                self.enhancementSetCursor(this);
                self.focus();
            });
            
            // Add the label (preview image and label text)
            $('<div/>', {'class': 'rte2-enhancement-label' }).appendTo($enhancement);

            // Add the enhancement to the editor
            mark = self.rte.enhancementAdd($enhancement[0], line, {
                block:true,
                // Set up a custom "toHTML" function so the editor can output the enhancement
                toHTML:function(){
                    return self.enhancementToHTML($enhancement);
                }
            });

            // If the data for this enhancement was provided, save it as part of the enhancement
            if (config.reference) {

                self.enhancementSetReference($enhancement, config.reference);

                if (config.alignment) {
                    self.enhancementSetPosition($enhancement, config.alignment);
                }

                self.enhancementUpdate($enhancement);

            } else {

                // No data was provided so this is a new enhancement.
                // Pop up the selection form.
                self.enhancementChange($enhancement);

            }
        },


        /**
         * Update the enhancement display, based on the enhancement data.
         * If the enhancement does not have data then remove it.
         */
        enhancementUpdate: function(el) {

            var $content, $edit, editUrl, $enhancement, emptyText, reference, $select, self;

            self = this;
            $enhancement = self.enhancementGetWrapper(el);
            $content = $enhancement.find('.rte2-enhancement-label');
            reference = self.enhancementGetReference($enhancement);
            emptyText = self.enhancementIsMarker($enhancement) ? 'Empty Marker' : 'Empty Enhancement';

            if (!reference.record) {
                self.enhancementRemoveCompletely($enhancement);
                return;
            }
            
            $content.empty();
            
            if (reference.preview) {

                $('<figure/>', {
                    html: [
                        $('<img/>', {
                            src: reference.preview,
                            title: reference.label || ''
                        }),
                        $('<figcaption/>', {
                            text: reference.label || ''
                        })
                    ]
                }).appendTo($content);

            } else {

                $content.text(reference.label || emptyText);

            }

            self.enhancementDisplaySize(el);

            // Modify the Select and Edit buttons in the toolbar
            if (reference.record && reference.record._ref) {
                
                $select = $enhancement.find('.rte2-enhancement-toolbar-change');
                $select.text('Change');

                // Modify the "Edit" button in the toolbar so it will pop up the edit dialog for the enhancement
                $edit = $enhancement.find('.rte2-enhancement-toolbar-edit');
                editUrl = $edit.attr('href') || '';
                editUrl = $.addQueryParameters(editUrl,
                                               'id', reference.record._ref,
                                               'reference', JSON.stringify(reference));
                $edit.attr('href', editUrl);
            }

            // Trigger change event so preview is updated
            self.rte.triggerChange();
        },


        /**
         * @returns jQuery
         * Returns a jQuery object containing the toolbar.
         *
         * @param {Object} [config]
         * Set of key:value pairs.
         *
         * @param {Boolean} [config.marker]
         * Set to true if this is a marker, or omit if it is an enhancement.
         */
        enhancementToolbarCreate: function(config) {

            var formAction, formId, formTypeId, self, sizes, $sizesSubmenu, $toolbar;

            self = this;

            config = config || {};

            $toolbar = $('<ul/>', {
                'class': 'rte2-enhancement-toolbar'
            });

            self.enhancementToolbarAddButton({
                text: 'Up',
                tooltip: 'Move Up',
                className: 'rte2-enhancement-toolbar-up',
                onClick: function() {
                    self.enhancementMove($toolbar, -1);
                }
            }, $toolbar);

            self.enhancementToolbarAddButton({
                text: 'Down',
                tooltip: 'Move Down',
                className: 'rte2-enhancement-toolbar-down',
                onClick: function() {
                    self.enhancementMove($toolbar, +1);
                }
            }, $toolbar);

            self.enhancementToolbarAddSeparator($toolbar);

            self.enhancementToolbarAddButton({
                text: 'Left',
                tooltip: 'Position Left',
                className: 'rte2-enhancement-toolbar-left',
                onClick: function() {
                    self.enhancementSetPosition($toolbar, 'left');
                }
            }, $toolbar);

            self.enhancementToolbarAddButton({
                text: 'Full',
                tooltip: 'Position Full Line',
                className: 'rte2-enhancement-toolbar-full',
                onClick: function() {
                    self.enhancementSetPosition($toolbar, 'full');
                }
            }, $toolbar);

            self.enhancementToolbarAddButton({
                text: 'Right',
                tooltip: 'Position Right',
                className: 'rte2-enhancement-toolbar-right',
                onClick: function() {
                    self.enhancementSetPosition($toolbar, 'right');
                }
            }, $toolbar);

            //*** Image Sizes ***

            sizes = self.enhancementGetSizes();
            if (sizes) {

                self.enhancementToolbarAddSeparator($toolbar);

                $sizesSubmenu = self.enhancementToolbarAddSubmenu({
                    text: 'Image Size',
                    className: 'rte2-enhancement-toolbar-sizes'
                }, $toolbar);

                self.enhancementToolbarAddButton({
                    text: 'None',
                    className: 'rte2-enhancement-toolbar-size',
                    onClick: function() {
                        self.enhancementSetSize($toolbar, '');
                    }
                }, $sizesSubmenu);

                $.each(sizes, function(internalName, displayName) {

                    self.enhancementToolbarAddButton({
                        text: displayName,
                        className: 'rte2-enhancement-toolbar-size',
                        onClick: function() {
                            self.enhancementSetSize($toolbar, internalName);
                        }
                    }, $sizesSubmenu);

                });
            }

            self.enhancementToolbarAddSeparator($toolbar);

            // For the select enhancement / marker popup, include parameters for the form id and typeId
            formAction = self.$el.closest('form').attr('action') || '';
            formId = (/id=([^&]+)/.exec(formAction) || [ ])[1] || '';
            formTypeId = (/typeId=([^&]+)/.exec(formAction) || [ ])[1] || '';
            
            self.enhancementToolbarAddButton({
                text: 'Select',
                tooltip: '',
                className: 'rte2-enhancement-toolbar-change',
                href: CONTEXT_PATH + (config.marker ? '/content/marker.jsp' : '/enhancementSelect') +
                    '?pt=' + encodeURIComponent(formId) + '&py=' + encodeURIComponent(formTypeId),
                target: self.enhancementGetTarget(),
            }, $toolbar);

            // Add the "Edit" button for an enhancement but not for a marker
            if (!config.marker) {

                self.enhancementToolbarAddButton({
                    href: CONTEXT_PATH + '/content/enhancement.jsp', // Note this url will be modified to add the enhancement id
                    target: self.enhancementGetTarget(),
                    text: 'Edit',
                    className: 'rte2-enhancement-toolbar-edit'
                }, $toolbar);

            }

            // CSS is used to hide this when the toBeRemoved class is set on the enhancement
            self.enhancementToolbarAddButton({
                text: 'Remove',
                className: 'rte2-enhancement-toolbar-remove',
                onClick: function() {
                    self.enhancementRemove($toolbar); // Mark to be removed
                }
            }, $toolbar);


            // CSS is used to hide this unless the toBeRemoved class is set on the enhancement
            self.enhancementToolbarAddButton({
                text: 'Restore',
                className: 'rte2-enhancement-toolbar-restore',
                onClick: function() {
                    self.enhancementRestore($toolbar, false);  // Erase the to be removed mark
                }
            }, $toolbar);

            // CSS is used to hide this unless the toBeRemoved class is set on the enhancement
            self.enhancementToolbarAddButton({
                text: 'Remove Completely',
                className: 'rte2-enhancement-toolbar-remove-completely',
                onClick: function() {
                    self.enhancementRemoveCompletely($toolbar);
                }
            }, $toolbar);

            return $toolbar;
        },


        /**
         * Add a submenu to the toolbar.
         *
         * @param {Object} item
         * The toolbar item to add.
         * @param {Object} item.className
         * @param {Object} item.text
         * @param {Object} item.tooltip
         *
         * @param {Object} [$addToSubmenu]
         * Where the submenu should be added.
         *
         * @returns {jQuery}
         * The submenu element where additional buttons can be added.
         */
        enhancementToolbarAddSubmenu: function(item, $addToSubmenu) {

            var self = this;
            var $submenu;

            $submenu = $('<li class="rte2-toolbar-submenu"><span></span><ul></ul></li>');
            $submenu.find('span').html(item.text);
            $submenu.appendTo($addToSubmenu);

            return $submenu.find('ul');
        },


        /**
         * Add a button to the toolbar (or to a submenu in the toolbar).
         *
         * @param {Object} item
         * The toolbar item to add.
         * @param {Object} item.className
         * @param {Object} item.text
         * @param {Object} item.tooltip
         * @param {Object} item.onClick
         *
         * @param {Object} [$submenu]
         * Toolbar or submenu where the button should be added.
         */
        enhancementToolbarAddButton: function(item, $submenu) {

            var self = this;
            var $button;

            // This is a toolbar button
            $button = $('<a/>', {
                href: item.href || '#',
                target: item.target || '',
                'class': item.className || '',
                html: item.text || '',
                title: item.tooltip || ''
            });

            if (item['data-enhancement-size'] !== undefined) {
                $button.attr('data-enhancement-size', item['data-enhancement-size']);
            }

            if (item.onClick) {
                $button.on('click', function(event) {
                    event.preventDefault();
                    // Call the onclick function, setting "this" to the clicked element
                    item.onClick.call(this, event);
                    return false;
                });
            }

            $('<li/>').append($button).appendTo($submenu);
        },


        /**
         * Add a button to the toolbar (or to a submenu in the toolbar).
         *
         * @param {Object} [$submenu]
         * Optional submenu where the button should be added.
         * If omitted, the button is added to the top level of the toolbar.
         * If provided this should be the value that was returned by toolbarAddSubmenu()
         */
        enhancementToolbarAddSeparator: function($submenu) {

            var self = this;

            $('<li/>', {
                'class': 'rte2-toolbar-separator',
                html: '&nbsp;'
            }).appendTo($submenu);
        },


        /**
         * Pop up the enhancement selector form.
         */
        enhancementChange: function(el) {

            var $enhancement;
            var self = this;

            $enhancement = self.enhancementGetWrapper(el);

            // Okay this is a bit of a hack.
            // We will simulate a click on the "Select Enhancement" toolbar button,
            // because there is another click event on the page that will handle that
            // and pop up the appropriate form to select the enhancement.

            $enhancement.find('.rte2-enhancement-toolbar-change').trigger('click');
        },


        enhancementRemove: function (el) {
            var $el, self;
            self = this;
            $el = self.enhancementGetWrapper(el);
            $el.addClass('toBeRemoved');
            
            // Trigger change event so preview is updated
            self.rte.triggerChange();
        },


        enhancementRemoveCompletely: function (el) {
            var mark, self;
            self = this;
            mark = self.enhancementGetMark(el);
            if (mark) {
                self.rte.enhancementRemove(mark);
            }
            
            // Trigger change event so preview is updated
            self.rte.triggerChange();
        },


        enhancementRestore: function (el) {
            var $el, self;
            self = this;
            $el = self.enhancementGetWrapper(el);
            $el.removeClass('toBeRemoved');
            
            // Trigger change event so preview is updated
            self.rte.triggerChange();
        },


        enhancementIsToBeRemoved: function(el) {
            var $el, self;
            self = this;
            $el = self.enhancementGetWrapper(el);
            return $el.hasClass('toBeRemoved');
        },


        enhancementMove: function(el, direction) {

            var $el, doScroll, mark, self, $popup, topNew, topOriginal, topWindow;

            self = this;

            mark = self.enhancementGetMark(el);
            if (!mark) {
                return;
            }

            if (direction === 1 || direction === -1) {

                $el = self.enhancementGetWrapper(el);
                
                topOriginal = $el.offset().top;
                    
                mark = self.rte.enhancementMove(mark, direction);

                topNew = $el.offset().top;

                // Adjust the scroll position of the window so the enhancement stays in the same position relative to the mouse.
                // This is to let the user repeatedly click the Up/Down button to move the enhancement multiple lines.
                // But only if we are not in a popup
                $popup = $el.popup('container');
                if ($popup.length && $popup.css('position') === 'fixed') {
                    doScroll = false;
                }
                if (doScroll !== false) {
                    topWindow = $(window).scrollTop();
                    $(window).scrollTop(topWindow + topNew - topOriginal);
                }
            }
        },

        
        /**
         * Set the editor cursor to the same line that contains the enhancement.
         */
        enhancementSetCursor: function(el) {
            var line, mark, self;

            self = this;
            
            mark = self.enhancementGetMark(el);
            if (!mark) {
                return;
            }

            line = self.rte.enhancementGetLineNumber(mark);
            
            self.rte.setCursor(line, 0);
        },

        
        /**
         * Sets the position for an enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         *
         * @param String [type=full]
         * The positioning type: 'left', 'right'. If not specified defaults
         * to full positioning.
         */
        enhancementSetPosition: function(el, type) {

            var $el, mark, rte, self;

            self = this;
            rte = self.rte;
            $el = self.enhancementGetWrapper(el);
            mark = self.enhancementGetMark($el);

            $el.removeClass('rte2-style-enhancement-right rte2-style-enhancement-left rte2-style-enhancement-full');

            switch (type) {

            case 'left':
                mark = rte.enhancementSetInline(mark);
                $el.addClass('rte2-style-enhancement-left');
                break;

            case 'right':
                mark = rte.enhancementSetInline(mark);
                $el.addClass('rte2-style-enhancement-right');
                break;

            default:
                mark = rte.enhancementSetBlock(mark);
                $el.addClass('rte2-style-enhancement-full');
                break;
            }

            rte.refresh();
        },


        /**
         * Returns the position for an enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         *
         * @returns String
         * Returns 'left' for float left, 'right' for float right, or empty string for full positioning.
         */
        enhancementGetPosition: function(el) {

            var $el, pos, self;

            self = this;
            $el = self.enhancementGetWrapper(el);

            if ($el.hasClass('rte2-style-enhancement-left')) {
                pos = 'left';
            } else if ($el.hasClass('rte2-style-enhancement-right')) {
                pos = 'right';
            }

            return pos || '';
        },


        /**
         * Given the element for the enhancement (or an element within that)
         * returns the wrapper element for the enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         */
        enhancementGetWrapper: function(el) {
            var self;
            self = this;
            return $(el).closest('.rte2-enhancement');
        },


        /**
         * Given the element for the enhancement (or an element within that)
         * returns the mark for that enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         */
        enhancementGetMark: function(el) {
            var self;
            self = this;
            el = self.enhancementGetWrapper(el);
            return self.rte.enhancementGetMark(el);
        },


        /**
         * Given the element for the enhancement (or an element within that)
         * sets the mark for that enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         *
         * @paream Object mark
         * The mark object that was returned by the rte.enhancementCreate() function.
         */
        enhancementSetMark: function(el, mark) {
            var self;
            self = this;
            self.enhancementGetWrapper(el).data('mark', mark);
        },


        /**
         * Generate a unique link target for enhancement toolbar links.
         */
        enhancementGetTarget: function() {
            var self;
            self = this;
            return 'contentEnhancement-' + self.enhancementGetTargetCounter++;
        },


        /**
         * Returns true if the enhancement is a marker.
         *
         * @param {Element} el
         * The enhancement element, or an element within the enhancement.
         *
         * @returns {Boolean}
         */
        enhancementIsMarker: function(el) {

            var self = this;
            var $enhancement = self.enhancementGetWrapper(el);
            return $enhancement.hasClass('rte2-marker');
        },


        /**
         * Get a list of image sizes that are supported for the enhancement.
         *
         * The enclosing inputContainer must contain an attribute data-standard-image-sizes.
         * For example:
         * data-standard-image-sizes="500x500 640x400"
         *
         * This is compared against the global variable window.STANDARD_IMAGE_SIZES to get
         * a list of supported sizes.
         * For example:
         * var STANDARD_IMAGE_SIZES = [
         *   {"internalName":"500x500 Square","displayName":"500x500 Square"},
         *   {"internalName":"640x400","displayName":"640x400"}
         * ];
         *
         * @returns {Object|undefined}
         * Returns undefined if no sizes are defined.
         * An object of the available sizes, where the key is the image size internal name,
         * and the value is the display name.
         * For example:
         * { "500x500": "500x500 Square" }
         */
        enhancementGetSizes: function() {

            var gotSize, self, sizes, sizesInputContainer, sizesGlobal;

            self = this;

            sizes = {};

            sizesGlobal = window.STANDARD_IMAGE_SIZES || [];

            // Get the sizes from the enclosing inputContainer
            sizesInputContainer = self.$el.closest('.inputContainer').attr('data-standard-image-sizes') || '';

            // The data attribute uses a space-separated list of size names.
            // To make matching easier we'll add space character before and after the string.
            sizesInputContainer = ' ' + sizesInputContainer + ' ';

            // Loop through all available sizes
            $.each(sizesGlobal, function(){

                var size = this;

                if (sizesInputContainer.indexOf(' ' + size.internalName + ' ') > -1) {
                    gotSize = true;
                    sizes[size.internalName] = size.displayName;
                }
            });

            return gotSize ? sizes : undefined;
        },


        /**
         * @param {Element} el
         * The enhancement element, or an element within the enhancement.
         *
         * @param {String} size
         * The internal name of the size.
         */
        enhancementSetSize: function(el, size) {

            var $enhancement, reference, self, sizes;

            self = this;

            $enhancement = self.enhancementGetWrapper(el);

            reference = self.enhancementGetReference(el);

            sizes = self.enhancementGetSizes() || {};

            // Check if the size that was selected is a valid size for this enhancement
            if (sizes[size]) {
                // Set the size
                reference.imageSize = size;
            } else {
                // Remove the size
                delete reference.imageSize;
            }

            self.enhancementSetReference(el, reference);
            self.enhancementDisplaySize(el);
        },


        /**
         * Add an attribute to the enhancement that can be used to display the image size (via CSS).
         */
        enhancementDisplaySize: function(el) {

            var $enhancement, $label, reference, self, sizes, sizeDisplayName, $sizeLabel;

            self = this;
            $enhancement = self.enhancementGetWrapper(el);
            $label = $enhancement.find('.rte2-enhancement-label');
            reference = self.enhancementGetReference(el);
            sizes = self.enhancementGetSizes(el) || {};
            sizeDisplayName = sizes[ reference.imageSize ];

            // Find size label if it already exists
            $sizeLabel = $label.find('.rte2-enhancement-size');

            // Only display  the label if a size has been selected for this image,
            // and that size is one of the available sizes
            if (reference.imageSize && sizeDisplayName) {

                // Create size label if it does not already exist
                if (!$sizeLabel.length) {
                    $sizeLabel = $('<div/>', { 'class': 'rte2-enhancement-size' }).appendTo($label);
                }

                $sizeLabel.text(sizeDisplayName);
                
            } else {

                // No size is selected so remove label if it exists
                $sizeLabel.remove();
            }
        },


        /**
         * Get the reference object for the enhancement.
         * @returns {Object}
         */
        enhancementGetReference: function(el) {

            var $enhancement, reference, self;

            self = this;

            $enhancement = self.enhancementGetWrapper(el);

            reference = $enhancement.data('reference') || {};

            return reference;
        },


        /**
         * Set the reference object for the enhancement.
         */
        enhancementSetReference: function(el, reference) {

            var $enhancement, self;

            self = this;

            $enhancement = self.enhancementGetWrapper(el);

            $enhancement.data('reference', reference);

            self.rte.triggerChange();
        },


        /**
         * Convert an enhancement into HTML for output.
         *
         * @param {Element} el
         * The enhancement element, or an element within the enhancement.
         *
         * @returns {String}
         * The HTMl for the enhancement.
         */
        enhancementToHTML: function(el) {

            var alignment, reference, $enhancement, html, $html, id, isMarker, self;

            self = this;

            $enhancement = self.enhancementGetWrapper(el);

            isMarker = self.enhancementIsMarker($enhancement);

            // If the enhancement is marked to be removed?
            if (self.enhancementIsToBeRemoved($enhancement)) {
                return '';
            }

            // Get the enhancement reference that was stored previously in a data attribute
            reference = self.enhancementGetReference($enhancement);
            if (reference.record) {
                id = reference.record._ref;
            }

            delete reference.alignment;
            alignment = self.enhancementGetPosition(el);
            if (alignment) {
                reference.alignment = alignment;
            }

            if (id) {

                $html = $('<button/>', {
                    'class': 'enhancement',
                    'data-id': id,
                    'data-reference': JSON.stringify(reference),
                    text: reference.label || ''
                });

                if (isMarker) {
                    $html.addClass('marker');
                }

                if (reference.preview) {
                    $html.attr('data-preview', reference.preview);
                }

                if (alignment) {
                    $html.attr('data-alignment', alignment);
                }

                html = $html[0].outerHTML;
            }

            return html || '';
        },

        /**
         * When importing from HTML, this function converts the enhancement HTML to an enhancement in the editor.
         *
         *
         * @param {jQuery} $content
         * The HTML for the enhancement, something like this:
         * <span class="enhancement" data-id="[id]" data-reference="[JSON]" data-alignment="[alignment]" data-preview="[preview]">Text</span>
         * Note that we output the enhancement as a button element, but in the textarea fields we received it as a span element.
         *
         * @param {Number} line
         * The line number for the enhancement.
         */
        enhancementFromHTML: function($content, line) {

            var self = this;
            var config = {};

            // Get enhancement options from the HTML, which looks like
            // <span data-id data-reference data-preview data-alignment/>

            if ($content.is('table')) {

                self.tableCreate($content, line);
                
            } else {

                try {
                    config.reference = JSON.parse($content.attr('data-reference') || '') || {};
                } catch(e) {
                    config.reference = {};
                }

                config.marker = $content.hasClass('marker');

                config.id = $content.attr('data-id');
                config.alignment = $content.attr('data-alignment');
                config.preview = $content.attr('data-preview');
                config.text = $content.text();

                self.enhancementCreate(config, line);
            }
        },


        /*==================================================
         * Inline Enhancements
         *==================================================*/

        inlineEnhancementInit: function() {
            
            var self;
            self = this;

            // Add onclick function to each style that is marked for inline enhancements
            // except for those with popup:false
            $.each(self.styles, function(styleKey, styleObj) {

                // Only modify the inline enhancement styles
                if (!styleObj.enhancementType) { return; }

                // If the style already has an onclick do not change it
                if (styleObj.onClick) { return; }
                
                // If this style does not have a popup (no need for the "Edit" button)
                // and it is a toggle (no need for the "Clear" button)
                // then do not add an onclick handler (so the dropdown will not appear)
                if (styleObj.popup === false && styleObj.toggle) { return; }

                styleObj.onClick = function(event, mark){
                    self.inlineEnhancementHandleClick(event, mark);
                };
            });
        },

        
        inlineEnhancementCreate: function(event, style) {

            var mark, self, styleObj;
            
            self = this;

            styleObj = self.rte.styles[style] || {};
            
            // Create a new mark then call the onclick function on it
            mark = self.rte.setStyle(style);
            if (mark) {
                self.inlineEnhancementHandleClick(event, mark);
            }

        },

        inlineEnhancementHandleClick: function(event, mark) {

            var enhancementEditUrl, $div, $divLink, frameName, html, offset, offsetContainer, range, self, styleObj;

            self = this;

            styleObj = self.rte.classes[mark.className] || {};
            if (!styleObj.enhancementType) {
                return;
            }
            if (styleObj.popup === false) {
                return;
            }
            
            // Stop the click from propagating up to the window
            // because if it did, it would close the popup we will be opening.
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            range = self.rte.markGetRange(mark);
            if (mark.rteTableMark) {
                // If this mark has rteTableMark=true, that means it is a "fake" CodeMirror mark
                // that we created for table elements. In that case we do not send the html to the
                // inline enhancement popup form.
                html = '';
            } else {
                html = self.rte.toHTML(range);
            }
            
            enhancementEditUrl = $.addQueryParameters(
                window.CONTEXT_PATH + '/content/enhancement.jsp',
                'typeId', styleObj.enhancementType,
                'attributes', JSON.stringify(mark.attributes),
                'body', $(html).html()
            );

            // Create a link for editing the enhancement and position it at the click event
            frameName = 'rte2-frame-enhancement-inline-' + frameTargetCounter++;
            $div = $('<div/>', {
                'class': 'rte2-frame-enhancement-inline',
                'style': 'position:absolute;top:0;left:0;height:1px;overflow:hidden;',
                html: $('<a/>', {
                    target: frameName,
                    href: enhancementEditUrl,
                    style: 'width:100%;display:block;',
                    text: '.'
                })
                
            }).appendTo(self.$container);

            // Set the position of the popup
            offset = self.rte.getOffset(range);
            offsetContainer = self.$container.offset();
            $div.css({
                'top': offset.top - offsetContainer.top,
                'left': offset.left - offsetContainer.left
            });
            $divLink = $div.find('a');

            // Add data to the link with the rte and the mark,
            // so any popup form can access them
            $divLink.data('rte', self);
            $divLink.data('mark', mark);
            
            // Listen for an 'enhancementUpdate' event that will be triggered on
            // the edit link, so we can tell when the enhancement is updated.
            // The enhancement edit form will trigger this event.
            if (!mark.rteTableMark) {
                
                // If this mark has rteTableMark=true, that means it is a "fake" CodeMirror mark
                // that we created for table/tr/td elements. In that case we do not allow the 
                // inline enhancement popup form to modify the html of the table.
                
                $divLink.on('enhancementUpdate', function(event, html){
                    self.inlineEnhancementReplaceMark(mark, html);
                });
            }
            
            // Listen for an 'enhancementRead' event that will be triggered on
            // the edit popup, so we can communicate the mark back to the popup form.
            // The enhancement edit form can trigger this event.
            // Alternately the popup form can get the rte and mark from the data on the source link.
            $divLink.on('enhancementRead', function(event, callback){
                // Call the callback, passing it the mark.
                // Also within the callback ensure that "this" refers to this instance of the rte.
                if (callback) {
                    callback.call(self, mark, html);
                }
            });

            // Do a fake "click" on the link so it will trigger the popup
            // but first wait for the current click to finish so it doesn't interfere
            // with any popups
            setTimeout(function(){
                
                $divLink.click();

                // When the popup is closed put focus back on the editor
                $(document).one('closed', '[name=' + frameName + ']', function(){
                    self.focus();
                    $div.remove();
                    self.rte.triggerChange();
                });

            }, 100);

        },

        
        /**
         * Given an existing mark, replace the entire mark with new HTML.
         * Note after calling this function, the original mark is no longer
         * valid and you will not have a pointer to the new mark.
         *
         * @param Object mark
         * A CodeMirror mark.
         *
         * @param String html
         * The HTML to replace the mark.
         */
        inlineEnhancementReplaceMark: function(mark, html) {
            
            var range, self;

            self = this;
            
            if (html && $.type(html) === 'string') {
                range = self.rte.markGetRange(mark);
                if (range.from) {
                    self.rte.fromHTML(html, range);
                }
            }
        },

        
        /*==================================================
         * Tables
         *==================================================*/


        /**
         * Initialize some data used to create tables.
         */
        tableInit: function() {

            var self;

            self = this;

            // Go through all the style definitions and see if they contain "table" elements
            $.each(self.styles, function(styleKey, styleObj) {

                switch (styleObj.element) {

                case 'table':
                    self.tableStyleTable = styleObj;
                    break;
                    
                case 'tr':
                    self.tableStyleRow = styleObj;
                    break;
                
                case 'td':
                case 'th':
                    self.tableStyleCell = styleObj;
                    break;
                }
                
            });
        },


        /**
         * 
         */
        tableCreate: function($content, line) {
            
            var columns, contextMenuItems, data, dataRows, $div, ht, $placeholder, self;
            self = this;

            // Get the structure of the HTML including attributes
            data = self.tableHTMLToData($content);
            
            // Convert the HTML structure into data that handsontable will understand
            dataRows = [];
            $.each(data.childNodes, function(i, row) {
                var dataRow;
                dataRow = [];
                $.each(row.childNodes, function(i, cell) {
                    dataRow.push(cell.childNodes[0]);
                });
                dataRows.push(dataRow);
            });

            if (line === undefined) {
                line = self.rte.getRange().from.line;
            }
            
            // Create wrapper element for the table and add the toolbar
            $div = $('<div/>', {
                'class': 'rte2-table'
            }).append( self.tableToolbarCreate() );

            // Create the placeholder div that will hold the table.
            // Note it appears you must set the style directly on the element or table resizing doesn't work correctly.
            $placeholder = $('<div/>', {'class':'rte2-table-placeholder', style:'overflow:hidden;height:auto;width:100%;'}).appendTo($div);

            // Create a fake CodeMirror mark to store the table attributes.
            // We set rteTableMark to true so we can later tell that this is not a real mark,
            // so we can avoid certain things like trying to get the range or html for the mark.
            self.tableMarkSetTable($placeholder, self.tableMarkCreate($placeholder, data.attr));

            // Set up the context menu for table cells
            contextMenuItems = {
                edit: {name:'Edit'}
            };

            if (self.tableStyleTable && self.tableStyleTable.onClick) {
                contextMenuItems.attrTable = {name:'Edit Table Attributes'}
            }
            if (self.tableStyleRow && self.tableStyleRow.onClick) {
                contextMenuItems.attrRow = {name:'Edit Row Attributes'}
            }
            if (self.tableStyleCell && self.tableStyleCell.onClick) {
                contextMenuItems.attrCell = {name:'Edit Cell Attributes'}
            }
            
            $.extend(contextMenuItems, {
                row_above: {},
                row_below: {},
                col_left: {},
                col_right: {},
                remove_row: {},
                remove_col: {},
                undo: {},
                redo: {}
            });
            
            // Initialize the table.
            $placeholder.handsontable({
                'data': dataRows,
                minCols:1,
                minRows:1,
                stretchH: 'all',
                contextMenu: {
                    callback: function (key, options) {
                        self.rte.triggerChange();
                        switch (key) {
                        case 'edit':
                            self.tableEditSelection($placeholder);
                            break;
                        case 'attrTable':
                            self.tableEditAttrTable($placeholder);
                            break;
                        case 'attrRow':
                            self.tableEditAttrRow($placeholder);
                            break;
                        case 'attrCell':
                            self.tableEditAttrCell($placeholder);
                            break;
                        }
                    },
                    items: contextMenuItems
                },
                fillHandle: false,
                renderAllRows: true,
                autoColumnsSize:true,
                autoRowSize:true,
                renderer: 'html',
                wordWrap:true,
                outsideClickDeselects:false,
                editor:false,
                afterSelectionEnd: function(r, c, r2, c2){
                    self.tableShowContextMenu($placeholder, r, c);
                },
                afterCreateRow: function() {
                    // Workaround - after a row or column is added a cell is selected.
                    // Do not pop up the editor in that case.
                    self.tableCancelEdit = true;
                },
                afterCreateCol: function() {
                    // Workaround - after a row or column is added a cell is selected.
                    // Do not pop up the editor in that case.
                    self.tableCancelEdit = true;
                },
                afterRemoveRow: function() {
                    // Workaround - after a row or column is removed a cell is selected.
                    // Do not pop up the editor in that case.
                    self.tableCancelEdit = true;
                    
                },
                afterRemoveCol: function() {
                    // Workaround - after a row or column is removed a cell is selected.
                    // Do not pop up the editor in that case.
                    self.tableCancelEdit = true;
                }
                 
            });

            // Add the div to the editor
            mark = self.rte.enhancementAdd($div[0], line, {
                block:true,
                // Set up a custom "toHTML" function so the editor can output the enhancement
                toHTML:function(){
                    if (self.tableIsToBeRemoved($div)) {
                        return '';
                    } else {
                        return self.tableToHTML($placeholder);
                    }
                }
            });

            // Set meta data onto the handsontable cells.
            // This will be used to save the element attributes from the HTML,
            // and also to give a place for the backend RichText elements to
            // update elements.
            ht = $placeholder.handsontable('getInstance');
            $.each(data.childNodes, function(rowIndex, row) {
                
                var rowMark;

                rowMark = self.tableMarkCreate($placeholder, row.attr);
                
                $.each(row.childNodes, function(cellIndex, cell) {
                    
                    var cellMark;

                    cellMark = self.tableMarkCreate($placeholder, cell.attr);
                    self.tableMarkSetCell($placeholder, rowIndex, cellIndex, cellMark);
                });

                // Note the row mark is set on every cell in the row.
                // If it is changed it should be updated on every cell in the row.
                self.tableMarkSetRow($placeholder, rowIndex, rowMark);

            });

            // Table will not render when it is not visible,
            // so tell it to render now that it has been added to the page
            $placeholder.handsontable('render');
        },

        
        /**
         * Show the context menu for a table cell.
         * NOTE: this is not an offically supported API for handsontable,
         * so it could possibly  break with future updates.
         *
         * @param {Element} el
         * The placeholder element where the table was created.
         * @param {Number} row
         * @param {Number} col
         */
        tableShowContextMenu: function(el, row, col) {

            var h, height, menu, offset, self, $td;

            self = this;
            
            h = $(el).handsontable('getInstance');
            if (h) {
                menu = h.getPlugin('contextMenu');
                $td = $(h.getCell(row, col));
                offset = $td.offset();
                height = $td.height();
                menu.open({pageY:offset.top + height, pageX:offset.left});
            }
        },

        
        /**
         * 
         */
        tableToolbarCreate: function() {

            var  self, $toolbar;

            self = this;

            $toolbar = $('<ul/>', {
                'class': 'rte2-enhancement-toolbar'
            });

            self.enhancementToolbarAddButton({
                text: 'Up',
                tooltip: 'Move Up',
                className: 'rte2-enhancement-toolbar-up',
                onClick: function() {
                    self.tableMove($toolbar, -1);
                }
            }, $toolbar);

            self.enhancementToolbarAddButton({
                text: 'Down',
                tooltip: 'Move Down',
                className: 'rte2-enhancement-toolbar-down',
                onClick: function() {
                    self.tableMove($toolbar, +1);
                }
            }, $toolbar);

            // CSS is used to hide this when the toBeRemoved class is set on the enhancement
            self.enhancementToolbarAddButton({
                text: 'Remove',
                className: 'rte2-enhancement-toolbar-remove',
                onClick: function() {
                    self.tableRemove($toolbar); // Mark to be removed
                }
            }, $toolbar);


            // CSS is used to hide this unless the toBeRemoved class is set on the enhancement
            self.enhancementToolbarAddButton({
                text: 'Restore',
                className: 'rte2-enhancement-toolbar-restore',
                onClick: function() {
                    self.tableRestore($toolbar, false);  // Erase the to be removed mark
                }
            }, $toolbar);

            // CSS is used to hide this unless the toBeRemoved class is set on the enhancement
            self.enhancementToolbarAddButton({
                text: 'Remove Completely',
                className: 'rte2-enhancement-toolbar-remove-completely',
                onClick: function() {
                    self.tableRemoveCompletely($toolbar);
                }
            }, $toolbar);

            return $toolbar;
        },


        /**
         * 
         */
        tableMove: function(el, direction) {

            var $el, mark, self, topNew, topOriginal, topWindow;
            
            self = this;

            mark = self.tableGetMark(el);
            if (!mark) {
                return;
            }

            if (direction === 1 || direction === -1) {

                $el = self.tableGetWrapper(el);
                
                topOriginal = $el.offset().top;
                    
                mark = self.rte.enhancementMove(mark, direction);

                topNew = $el.offset().top;

                // Adjust the scroll position of the window so the enhancement stays in the same position relative to the mouse.
                // This is to let the user repeatedly click the Up/Down button to move the enhancement multiple lines.
                topWindow = $(window).scrollTop();
                $(window).scrollTop(topWindow + topNew - topOriginal);
            }
        },

        
        /**
         * 
         */
        tableRemove: function (el) {
            var $el, self;
            self = this;
            $el = self.tableGetWrapper(el);
            $el.addClass('toBeRemoved');
            self.rte.triggerChange();
        },

        
        /**
         * 
         */
        tableRemoveCompletely: function (el) {
            var mark, self;
            self = this;
            mark = self.tableGetMark(el);
            if (mark) {
                self.rte.enhancementRemove(mark);
            }
        },


        /**
         * 
         */
        tableRestore: function (el) {
            var $el, self;
            self = this;
            $el = self.tableGetWrapper(el);
            $el.removeClass('toBeRemoved');
            self.rte.triggerChange();
        },


        /**
         * 
         */
        tableIsToBeRemoved: function(el) {
            var $el, self;
            self = this;
            $el = self.tableGetWrapper(el);
            return $el.hasClass('toBeRemoved');
        },

        /**
         * Given the element for the enhancement (or an element within that)
         * returns the wrapper element for the enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         */
        tableGetWrapper: function(el) {
            var self;
            self = this;
            return $(el).closest('.rte2-table');
        },


        /**
         * Given the element for the enhancement (or an element within that)
         * returns the mark for that enhancement.
         *
         * @param Element el
         * The enhancement element, or an element within the enhancement.
         */
        tableGetMark: function(el) {
            var self;
            self = this;
            el = self.tableGetWrapper(el);
            return self.rte.enhancementGetMark(el);
        },

        
        /**
         * Parse the HTML of a table and return as a data object.
         *
         * @param [String|Object] {$content}
         * HTML for the table element, or a DOM or jQuery object.
         * If this is not specified returns data for a new table.
         *
         * @returns Object
         * Data from the table in the form of an nested Object.
         * The object consists of nodes with the following parameters:
         *   tagName = the name of the element (table, tr, td, th)
         *   attr = a set of key/value pairs representing the attributes on the element
         *   childNodes = an array of child nodes
         * Or a node can be a string to represents next within an element.
         */
        tableHTMLToData: function($content) {
            
            var data, self;

            self = this;

            // If creating a new table, start with one that has a single row with two columns
            if (!$content) {
                data = {
                    tagName:'table',
                    childNodes:[
                        {
                            tagName: 'tr',
                            childNodes: [
                                { tagName: 'td', childNodes: [''] },
                                { tagName: 'td', childNodes: [''] }
                            ]
                        }
                    ]
                };
                return data;
            }
            
            // Just in case HTML or a DOM element is passed in convert to jQuery object
            $content = $($content);

            // Create the initial table node
            data = {
                tagName:'table',
                childNodes: [],
                attr: self.rte.getAttributes($content)
            };

            // Loop through the rows in the table
            $content.find('>tr,>tbody >tr,>thead >tr,>tfoot >tr').each(function(i, tr) {
                
                var dataRow;
                
                // Create the node for the row
                dataRow = {
                    tagName: 'tr',
                    childNodes: [],
                    attr: self.rte.getAttributes(tr)
                };

                // Loop through all the columns in the row
                $(tr).find('>td,>th').each(function(i, cell) {

                    var dataCell;

                    dataCell = {
                        tagName: $(cell).prop('tagName').toLowerCase(),
                        childNodes: [],
                        attr: self.rte.getAttributes(cell)
                    };

                    // Get the HTML in the column and add it to the row
                    dataCell.childNodes.push( $(cell).html() );

                    // Add the cell to the row
                    dataRow.childNodes.push(dataCell);
                });

                // Add the row to the table
                data.childNodes.push(dataRow);
                
            });

            return data;
        },

        
        /**
         * Convert a handsontable placeholder to the HTML for the table.
         *
         * @param {Element|jQuery} placeholder
         * The placeholder element on which handsontable was initialized.
         *
         * @returns String
         * The HTML for the table.
         */
        tableToHTML: function(placeholder) {

            var data, ht, html, $placeholder, self, tableAttr, tableMark;

            self = this;

            $placeholder = $(placeholder);
            
            ht = $placeholder.handsontable('getInstance');

            data = ht.getData();

            tableMark = self.tableMarkGetTable(placeholder) || {};
            
            html = self.tableOpenElement('table', tableMark.attributes);
            
            $.each(data, function(rowIndex, row) {
                
                var rowMark;

                rowMark = self.tableMarkGetRow(placeholder, rowIndex) || {};

                html += self.tableOpenElement('tr', rowMark.attributes);

                $.each(row, function(cellIndex, cell) {
                    var cellMark;

                    cellMark = self.tableMarkGetCell(placeholder, rowIndex, cellIndex) || {};
                    
                    html += self.tableOpenElement('td', cellMark.attributes) + (cell || '') + '</td>';
                });
                html += '</tr>';
            });

            html += '</table>';

            return html;
        },

        
        /**
         * Create the opening element plus attributes when exporting HTML.
         *
         * @param {String} element
         * Element name.
         *
         * @param {Object} attributes
         * Set of key/value pairs representing attributes on the element.
         */
        tableOpenElement: function(element, attributes) {

            var html, self;

            self = this;
            
            html = '';

            attributes = attributes || {};
                
            html = '<' + element;

            $.each(attributes, function(attr, value) {
                html += ' ' + attr + '="' + self.rte.htmlEncode(value) + '"';
            });
                
            html += '>';
            
            return html;
        },
        

        /**
         * 
         */
        tableEditInit: function() {
            
            var $controls, self;

            self = this;

            // Check if editor already exists
            if (self.$tableEditDiv) {
                
                // Empty the editor
                self.tableEditRte.rte.empty();
                
                // Turn off track changes before we add content to the editor
                self.tableEditRte.rte.trackSet(false);
            
                return;
            }
            
            // Create popup used to display the editor
            self.$tableEditDiv = $('<div>', {'class':'rte2-table-editor'}).appendTo(document.body);
            
            $('<h1/>', {
                'class': 'widget-heading',
                text: 'Edit Table Cell'
            }).appendTo(self.$tableEditDiv);

            self.$tableEditTextarea = $('<textarea>').appendTo(self.$tableEditDiv);
            self.tableEditRte = Object.create(Rte);
            self.tableEditRte.init(self.$tableEditTextarea);

            $controls = $('<div/>', {'class': 'rte2-table-editor-controls'}).appendTo(self.$tableEditDiv);

            self.$tableEditSave = $('<button/>', {
                'class': 'rte2-table-editor-save',
                text: 'Set',
                click: function(event) {
                    event.preventDefault();
                    $(this).popup('close');
                }
            }).appendTo($controls);
            
            self.$tableEditSave = $('<button/>', {
                'class': 'rte2-table-editor-cancel',
                text: 'Cancel',
                click: function(event) {
                    event.preventDefault();
                    self.tableEditCancel = true;
                    $(this).popup('close');
                }
            }).appendTo($controls);

            self.$tableEditDiv.popup({parent:self.$container}).popup('close');
            
            // Give the popup a name so we can control the width
            self.$tableEditDiv.popup('container').attr('name', 'rte2-frame-table-editor');
        },

        
        /**
         * @param jQuery $el
         * The placeholder div that contains the handsontable
         */
        tableEditSelection: function($el) {

            var range, self, value;

            self = this;
            
            range = $el.handsontable('getSelected');


            // Set up a nested rich text editor in a popup
            // (but only do this once)
            self.tableEditInit();

            // Set a flag so we only update the table cell if user clicks the save button
            self.tableEditCancel = false;
            
            value = $el.handsontable('getValue') || '';
            
            self.$tableEditDiv.popup('open');

            self.tableEditRte.fromHTML(value);

            // Turn on or off track changes in the table editor, based on the track changes setting in the main editor
            self.tableEditRte.rte.trackSet( self.rte.trackIsOn() );

            self.tableEditRte.focus();
            self.tableEditRte.refresh();

            // Due to a bug in handsontable, it steals the arrow keys even when it does not have focus.
            // So until that bug is fixed we must deselect the current cell to allow the editor to get the arrow keys.
            $el.handsontable('deselectCell');

            self.$tableEditDiv.popup('container').one('closed', function(){

                 if (self.tableEditCancel) {
                     self.tableEditCancel = false;
                 } else {
                     value = self.tableEditRte.toHTML();
                     $el.handsontable('setDataAtCell', range[0], range[1], value);
                 }

            });
        },

        
        /**
         * Edit the table element attributes.
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         */
        tableEditAttrTable: function(el) {
            
            var $el, mark, self;
            
            self = this;
            $el = $(el);

            // Make sure there is backend style that is meant for editing the table
            if (!self.tableStyleTable) { return; }

            // Get the existing attributes for the table
            mark = self.tableMarkGetTable(el);
            if (!mark) { return; }

            mark.className = self.tableStyleTable.className;

            // Pop up backend form to edit the table attributes
            self.inlineEnhancementHandleClick(null, mark);
        },

        
        /**
         * Edit the tr element attributes.
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         */
        tableEditAttrRow: function(el) {
            
            var $el, mark, rangeTable, self;
            
            self = this;
            $el = $(el);

            // Make sure there is backend style that is meant for editing the table
            if (!self.tableStyleRow) { return; }

            // Get the selected cell
            rangeTable = $el.handsontable('getSelected');

            mark = self.tableMarkGetRow(el, rangeTable[0]);
            if (!mark) {
                mark = self.tableMarkCreate(el);
                self.tableMarkSetRow(el, rangeTable[0], mark);
            }

            mark.className = self.tableStyleRow.className;
            
            // Pop up backend form to edit the table attributes
            self.inlineEnhancementHandleClick(null, mark);
        },

        
        /**
         * Edit the td element attributes.
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         */
        tableEditAttrCell: function(el) {
            
            var $el, mark, rangeTable, self;
            
            self = this;
            $el = $(el);

            // Make sure there is backend style that is meant for editing the table
            if (!self.tableStyleCell) { return; }

            // Get the selected cell
            rangeTable = $el.handsontable('getSelected');

            mark = self.tableMarkGetCell(el, rangeTable[0], rangeTable[1]);
            if (!mark) {
                mark = self.tableMarkCreate(el);
                self.tableMarkSetCell(el, rangeTable[0], rangeTable[1], mark);
            }

            mark.className = self.tableStyleCell.className;
            
            // Pop up backend form to edit the table attributes
            self.inlineEnhancementHandleClick(null, mark);
        },


        /**
         * Create a fake CodeMirror mark to be used for table, tr, td elements.
         * @param {Object} attributes
         * @param {Object} [parameters]
         * Optional set of parameters to also add to the mark.
         * For example, to add a className.
         */
        tableMarkCreate: function(el, attributes, parameters) {
            
            var mark, self;
            
            self = this;

            mark = {
                rteTableMark:true,
                attributes: attributes || {},
                find: function() {
                    // TODO: this returns the position of the bottom of the table,
                    // which is not a good representation of where we want the
                    // popup to appear, but that is all that is supported
                    // by inline enhancement right now
                    var tableMark, line;
                    tableMark =  self.tableGetMark(el);
                    if (tableMark) {
                        line = tableMark.line.lineNo();
                        return {from:{line:line,ch:0}, to:{line:line,ch:0}};
                    } else {
                        return {from:{line:0,ch:0}, to:{line:0,ch:0}};
                    }
                },
                clear: function() {
                    // TODO: remove the table?
                    return;
                }
            };

            if (parameters) {
                $.extend(mark, parameters);
            }
            
            return mark;
        },

        
        /**
         * Update the mark for the table element.
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         * @param {Object} mark
         * The fake CodeMirror mark for the table element.
         */
        tableMarkSetTable: function(el, mark) {
            var self;
            self = this;
            $(el).data('markTable', mark);
        },

        
        /**
         * Retrieve the mark for the table element.
         *
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         *
         * @returns {Object} mark
         * The fake CodeMirror mark for the table element, or undefined if none is defined.
         */
        tableMarkGetTable: function(el) {
            var self;
            self = this;
            return $(el).data('markTable');
        },

        
        /**
         * Update the mark for the tr element.
         * Note this sets the mark on every cell in the row
         * because cells can be removed and we need to maintain the row mark
         * when that happens.
         *
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         *
         * @param {Number} row
         * The row number of the table.
         *
         * @param {Object} mark
         * The fake CodeMirror mark for the table element.
         */
        tableMarkSetRow: function(el, row, mark) {
            var col, ht, self;
            self = this;
            ht = $(el).handsontable('getInstance');
            for (col = 0; col < ht.countCols(); col++) {
                ht.setCellMeta(row, col, 'rowMark', mark);
            }
        },


        /**
         * Retrieve the mark for a table row.
         * 
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         *
         * @param {Number} row
         * The row number of the table.
         *
         * @returns {Object}
         * The fake CodeMirror mark for the table element, or undefined if none is defined.
         */
        tableMarkGetRow: function(el, row) {
            var col, ht, meta, self;
            self = this;
            ht = $(el).handsontable('getInstance');

            // In some cases like when a new column is added to the table,
            // the first cell in the row might not have the row mark saved.
            // So we start with the leftmost cell and keep going until we find a row mark.
            for (col = 0; col < ht.countCols(); col++) {
                meta = ht.getCellMeta(row, col);
                if (meta) {
                    break;
                }
            }

            return meta;
        },

        
        /**
         * Update the mark for the td element (table cell).
         *
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         *
         * @param {Number} row
         * The row number of the table.
         *
         * @param {Number} col
         * The column number of the table.
         *
         * @param {Object} mark
         * The fake CodeMirror mark for the table element.
         */
        tableMarkSetCell: function(el, row, col, mark) {
            var ht, self;
            self = this;
            ht = $(el).handsontable('getInstance');
            ht.setCellMeta(row, col, 'cellMark', mark);
        },

        
        /**
         * Retrieve the mark for a table cell.
         * 
         * @param {Element|jquery} el
         * The placeholder element where handsontable was initialized.
         *
         * @param {Number} row
         * The row number of the table.
         *
         * @returns {Object}
         * The fake CodeMirror mark for the table element, or undefined if none is defined.
         */
        tableMarkGetCell: function(el, row, col) {
            var ht, meta, self;
            self = this;
            ht = $(el).handsontable('getInstance');
            meta = ht.getCellMeta(row, col);
            return meta.cellMark;
        },

        
        /*==================================================
         * Placeholder
         *==================================================*/

        /**
         * Set the placeholder text for when the editor is empty,
         * and periodically check to see if the placeholder text
         * has changed.
         */
        placeholderInit: function() {
            var self = this;

            self.placeholderRefresh();

            self.$container.on('rteChange', $.throttle(500, function(){
                self.placeholderRefresh();
            }));
        },


        /**
         * Check to see if the textarea has a placeholder attribute, and
         * if so display it over the rich text editor when the editor is empty.
         */
        placeholderRefresh: function() {
            var self = this;
            var placeholder = self.$el.attr('placeholder');

            if (!placeholder) {
                return;
            }

            var count = self.rte.getCount();
            var $editor = self.$editor;
            var ATTR_NAME = 'rte2-placeholder';

            if (count === 0) {
                $editor.attr(ATTR_NAME, placeholder);
                
            } else if ($editor.attr(ATTR_NAME)) {
                $editor.removeAttr(ATTR_NAME);
            }
        },

        
        /*==================================================
         * Preview
         * To support brightspot cms preview functionality,
         * we must keep the textarea updated with the most recent data.
         * Triggering an "input" event will update the preview.
         *==================================================*/

        
        /**
         * Initialize an event listener so whenever the rich text editor changes,
         * we update the textarea with the latest content, and trigger an
         * event to update the preview.
         *
         * This is throttled agressively to prevent performance problems.
         */
        previewInit: function() {
            
            var self;
            self = this;

            self.$container.on('rteChange', $.debounce(2000, function(){
                self.previewUpdate();
            }));
        },

        
        /**
         * Update the textarea with the latest content from the rich text editor,
         * plus trigger an "input" event so the preview will be updated, and
         * a "change" event so the change indicator can be updated.
         */
        previewUpdate: function() {
            
            var html, self, val;
            
            self = this;

            // Do not update if we are in read only mode
            if (self.rte.readOnlyGet()) {
                return;
            }
            
            // Do not update if the content in the editor has not been changed
            if (!self.changed) {
                return;
            }

            html = self.toHTML();

            val = self.$el.val();
            
            if (html !== val) {
                self.$el.val(html).trigger('input').trigger('change');
            }
        },

        
        /*==================================================
         * Misc
         *==================================================*/

        fromHTML: function(html) {
            var self;
            self = this;
            return self.rte.fromHTML(html);
        },


        toHTML: function() {
            var html, self;
            self = this;
            if (self.rte.modeGet() === 'rich') {
                html = self.rte.toHTML();
            } else {
                html = self.$el.val();
            }
            return html;
        },

        toText: function() {
            var self, text;
            self = this;
            text = self.rte.toText();
            return text;
        },

        focus: function() {
            var self;
            self = this;
            if (self.rte.modeGet() === 'rich') {
                self.rte.focus();
                self.toolbarUpdate();
                self.rte.refresh();
            } else {
                self.$el.focus();
            }
        },

        refresh: function() {
            var self;
            self = this;
            self.rte.refresh();
        },
        
        setCursor: function(line, ch) {
            var self;
            self.rte.setCursor(line, ch);
        }

    };

    if (window.RICH_TEXT_ELEMENTS && RICH_TEXT_ELEMENTS.length > 0) {
        $.each(RICH_TEXT_ELEMENTS, function (index, rtElement) {
            var styleName = rtElement.styleName;
            var tag = rtElement.tag;

            Rte.styles[styleName] = {
                className: 'rte2-style-' + styleName,
                enhancementType: rtElement.typeId,
                enhancementName: rtElement.displayName,
                element: tag,
                elementAttrAny: true,

                // If the enhancement has a popup form, do not let it span more than one line
                // or it will be split into multiple elements and the popup will not apply to
                // all of them
                singleLine: Boolean(rtElement.popup !== false),

                initialBody: rtElement.initialBody,
                line: Boolean(rtElement.line),
                readOnly: Boolean(rtElement.readOnly),
                popup: rtElement.popup === false ? false : true,
                context: rtElement.context,
                keymap: rtElement.keymap,
                clear: rtElement.clear,
                toggle: rtElement.toggle
            };
        });
    }

    // Expose as a jQuery plugin.
    $.plugin2('rte2', {

        _defaultOptions: {
            inline:false
        },

        _create: function(input) {

            var inline, $input, options, rte;

            $input = $(input);

            // ??? Not really sure how plugin2 works, just copying existing code

            // Get the options from the element
            // Make a copy of the object with extend so we don't
            // accidentally change any global default options
            options = $.extend(true, {}, this.option());

            var tags = $input.attr('data-rte-tags');

            if (tags) {
                options.richTextElementTags = JSON.parse(tags);
            }

            inline = $input.data('inline');
            if (inline !== undefined) {
                options.inline = inline;
            }

            // ???
            $input.data('rte2-options', options);


            rte = Object.create(Rte);
            rte.init(input, options);

            return;
        },

        enable: function() {
            return this;
        }

    });


    return Rte;

});


/*** TODO

// In the old RTE there was some kind of "import" capability.
// This has not yet been added into this new RTE.

        if (win.cmsRteImportOptions && win.cmsRteImportOptions.length > 0) {
            var $importGroup = $createToolbarGroup('Import');

            $importGroup.addClass('rte2-group-dropDown');
            $toolbar.append($importGroup);

            $importGroup = $importGroup.find('.rte2-group-buttons');

            $.each(win.cmsRteImportOptions, function(i, importOptions) {
                $importGroup.append($('<span/>', {
                    'class': 'rte2-button rte2-button-import',
                    'text': importOptions.name,
                    'click': function() {
                        var $button = $(this);

                        google.load('picker', '1', {
                            'callback': function() {
                                new google.picker.PickerBuilder().
                                        enableFeature(google.picker.Feature.NAV_HIDDEN).
                                        setAppId(importOptions.clientId).
                                        setOAuthToken(importOptions.accessToken).
                                        addView(google.picker.ViewId.DOCUMENTS).
                                        setCallback(function(data) {
                                            if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                                                $.ajax({
                                                    'method': 'get',
                                                    'url': '/social/googleDriveFile',
                                                    'data': { 'id': data[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID] },
                                                    'cache': false,
                                                    'success': function(data) {
                                                        rte.composer.setValue(data, true);
                                                        rte.composer.parent.updateOverlay();
                                                    }
                                                });
                                            }
                                        }).
                                        build().
                                        setVisible(true);
                            }
                        });
                    }
                }));
            });
        }

***/

// Set filename for debugging tools to allow breakpoints even when using a cachebuster
//# sourceURL=richtext2.js
