/*global document, Polymer, window*/

(function () {

	'use strict';

	var
		BOTTOM_BAR_TOOLBAR_SLOT = 'bottom-bar-toolbar',
		BOTTOM_BAR_MENU_SLOT = 'bottom-bar-menu';

	Polymer({

		is: 'cosmoz-bottom-bar',

		behaviors: [
			Polymer.IronResizableBehavior
		],

		listeners: {
			'iron-resize': '_onResize',
			'iron-overlay-closed': '_dropdownClosed',
		},

		properties: {

			/**
			 * Whether the bar is active (shown)
			 */
			active: {
				type: Boolean,
				value: false,
				notify: true,
				reflectToAttribute: true
			},

			/**
			 * Bar height (not used when `matchParent` or `matchElementHeight` is set)
			 */
			barHeight: {
				type: Number,
				value: 64
			},

			/**
			 * Whether to match the height of parent
			 */
			matchParent: {
				type: Boolean,
				value: false
			},

			/**
			 * Whether this bottom bar has items distributed to the menu
			 */
			hasMenuItems: {
				type: Boolean,
				value: false,
				readOnly: true,
				notify: true
			},

			hasExtraItems: {
				type: Boolean,
				value: false
			},

			/**
			 * Class applied the the selected item
			 */
			selectedClass: {
				type: String,
				value: 'cosmoz-bottom-bar-selected-item'
			},

			/**
			 * Class applied to items distributed to the toolbar
			 */
			toolbarClass: {
				type: String,
				value: 'cosmoz-bottom-bar-toolbar'
			},

			/**
			 * Class applied to items distributed to the menu
			 */
			menuClass: {
				type: String,
				value: 'cosmoz-bottom-bar-menu'
			},

			/**
			 * Maximum number of items in toolbar, regardless of space
			 */
			maxToolbarItems: {
				type: Number,
				value: 3
			},

			/**
			 * The actual bar height, depending on if we `matchParent` or set `barHeight`
			 */
			computedBarHeight: {
				type: Number,
				computed: '_computeComputedBarHeight(_matchHeightElement, barHeight, _computedBarHeightKicker)',
				notify: true
			},

			/**
			 * Kicker to make `computedBarHeight` recalculate
			 */
			_computedBarHeightKicker: {
				type: Number
			},

			/**
			 * Whether the bar is visible (has actions and is `active`)
			 */
			visible: {
				type: Boolean,
				notify: true,
				readOnly: true,
				computed: '_computeVisible(hasActions, active, hasExtraItems)'
			},

			/**
			 * Whether we have any visible actions
			 */
			hasActions: {
				type: Boolean,
				value: false,
				readOnly: true,
				notify: true
			},

			/**
			 * Reference element from which to inherit height
			 */
			_matchHeightElement: {
				type: Object,
				computed: '_getHeightMatchingElement(matchParent)'
			},
		},

		/**
		 * Non-Polymer properties
		 */
		_nodeObserver: undefined,
		_nodeObserverExtra: undefined,
		_hiddenMutationObserver: undefined,

		observers: [
			'_showHideBottomBar(visible, computedBarHeight)'
		],

		attached() {
			// eslint-disable-next-line no-unused-vars
			this._hiddenMutationObserver = new MutationObserver(function (mutations) {
				this._overflowWidth = undefined;
				this._debounceLayoutActions();
			}.bind(this));
			this._nodeObserver = Polymer.dom(this.$.content).observeNodes(this._childrenUpdated.bind(this));
			this._nodeObserverExtra = Polymer.dom(this.$.extraSlot).observeNodes(info => this.set('hasExtraItems', info.addedNodes.length > 0));
			this._computedBarHeightKicker = 0;
		},

		detached() {
			Polymer.dom(this).unobserveNodes(this._nodeObserver);
			Polymer.dom(this).unobserveNodes(this._nodeObserverExtra);
			this._hiddenMutationObserver.disconnect();
			this.cancelDebouncer('layoutActions');
		},

		_computeVisible(hasActions, active, hasExtraItems) {
			return (hasActions || hasExtraItems) && active;
		},

		_getHeightMatchingElement(matchParent) {
			if (matchParent) {
				return this.parentElement;
			}

			return null;
		},

		// eslint-disable-next-line no-unused-vars
		_computeComputedBarHeight(matchElementHeight, barHeight, kicker) {
			if (matchElementHeight) {
				return matchElementHeight.offsetHeight;
			}
			return barHeight;
		},

		_getHeightStyle(height) {
			return 'height: ' + height + 'px;';
		},

		_onResize() {
			this._computedBarHeightKicker += 1;
			this._debounceLayoutActions();
		},

		_showHideBottomBar(visible, barHeight) {
			this.style.display = '';
			const	translateY = visible ? 0 : barHeight,
				onEnd = ()=> {
					clearTimeout(this._hideTimeout);
					this._hideTimeout = null;
					this.style.display = this.visible ? '' : 'none';
				};
			clearTimeout(this._hideTimeout);
			requestAnimationFrame(()=>{
				this.translate3d('0px', translateY + 'px', '0px');
				this._hideTimeout = setTimeout(onEnd, 510);
			});
		},

		_isActionNode(node) {
			return node.nodeType === Node.ELEMENT_NODE &&
				node.getAttribute('slot') !== 'info' &&
				node.tagName !== 'TEMPLATE' &&
				node.tagName !== 'DOM-REPEAT' &&
				node.tagName !== 'DOM-IF' &&
				node.getAttribute('slot') !== 'extra';
		},

		_childrenUpdated(info) {
			var addedNodes = info.addedNodes.filter(this._isActionNode),
				removedNodes = info.removedNodes.filter(this._isActionNode);

			if (addedNodes.length === 0 && removedNodes.length === 0) {
				return;
			}

			addedNodes
				.filter(function (node) {
					// ignore nodes that are moved between slots
					return removedNodes.indexOf(node) === -1;
				})
				.forEach(function (node) {
					this._hiddenMutationObserver.observe(node, {
						attributes: true,
						attributeFilter: [
							'hidden'
						]
					});
					if (Polymer.dom(node).parentNode !== this) {
						Polymer.dom(this).appendChild(node);
					}
					this._moveElement(node, true);
					//this._toolbarMoveToStart(node);
				}, this);

			this._debounceLayoutActions();
		},

		_toolbarMoveToStart(node) {
			var toolbar = this.$.toolbar;
			if (toolbar.children.length === 0) {
				toolbar.appendChild(node);
				return;
			}
			toolbar.insertBefore(node, toolbar.children[0]);
		},

		_dropdownClosed() {
			this.$.dropdownButton.active = false;
		},

		/**
		 * Layout the actions available as buttons or menu items
		 *
		 * If the window is resizing down, just make sure that all buttons fits, and if not,
		 * move one to menu and call itself async (to allow re-rendering) and see if we fit.
		 * Repeat until the button fits or no buttons are left.
		 *
		 * If the window is sizing up, try to place a menu item out as a button, call itself
		 * async (to allow re-rendering) and see if we fit - if we don't, remove the button again.
		 *
		 * We also need to keep track of `_scalingUp` between calls since the resize might fire
		 * a lot of events, and we don't want to be starting multiple "calculation processes"
		 * since this will result in an infinite loop.
		 *
		 * The actual layouting of actions will be performed by adding or removing the 'button'
		 * attribute from the action, which will cause it to match different content insertion
		 * points.
		 *
		 * @param  {Boolean} bigger If we're sizing up
		 *
		 */

		_layoutActions() {
			var elements = this.getEffectiveChildren()
					.filter(this._isActionNode)
					.filter(function (element) {
						return !element.hidden;
					}),
				toolbarElements,
				menuElements,
				toolbar = this.$.toolbar,
				currentWidth,
				fits,
				newToolbarElement,
				newMenuElement;

			this._setHasActions(elements.length > 0 || this.hasExtraItems);
			if (!this.hasActions) {
				// No need to render if we don't have any actions
				return;
			}

			currentWidth = toolbar.clientWidth;
			fits = toolbar.scrollWidth <= currentWidth + 1;

			toolbarElements = elements.filter(function (element) {
				if (element.getAttribute('slot') === BOTTOM_BAR_TOOLBAR_SLOT) {
					// make sure we only read scrollWidth and clientWidth until
					// know that we don't fit
					fits = fits && element.scrollWidth <= element.clientWidth;
					return true;
				}
			});

			menuElements = elements.filter(function (element) {
				return element.getAttribute('slot') === BOTTOM_BAR_MENU_SLOT;
			});

			this._setHasMenuItems(menuElements.length > 0);

			fits = fits && toolbarElements.length <= this.maxToolbarItems;

			if (fits) {
				if (this._canAddMoreButtonToBar(currentWidth, toolbarElements, menuElements)) {
					newToolbarElement = menuElements[0];
					this._moveElement(newToolbarElement, true);
					// (pasleq) If we are moving the focused element from the menu to the toolbar
					// while the toolbar is open, this will cause an error in iron-control-state
					// that tries to handle lost of focus on an element that has been removed.
					if (toolbarElements.length > 0) {
						toolbarElements[0].focus();
					} else {
						newToolbarElement.focus();
					}
					this.$.menu.close();
					this._debounceLayoutActions();
				}
				return;
			}

			this._overflowWidth = currentWidth;

			if (toolbarElements.length < 1) {
				return;
			}

			newMenuElement = toolbarElements[toolbarElements.length - 1];
			this._moveElement(newMenuElement, false);
			this._debounceLayoutActions();
		},

		_moveElement(element, toToolbar) {
			var slot = toToolbar ? BOTTOM_BAR_TOOLBAR_SLOT : BOTTOM_BAR_MENU_SLOT,
				tabindex = toToolbar ? '0' : '-1';

			element.setAttribute('slot', slot);
			element.setAttribute('tabindex', tabindex);
			this.toggleClass(this.menuClass, !toToolbar, element);
			this.toggleClass(this.toolbarClass, toToolbar, element);
			this.updateStyles();
		},

		_debounceLayoutActions() {
			this.debounce('layoutActions', this._layoutActions, 30);
		},

		_canAddMoreButtonToBar(width, bottomBarElements, menuElements) {

			var hasSpace = width > this._overflowWidth || this._overflowWidth === undefined,
				hasPlace = bottomBarElements.length < this.maxToolbarItems,
				hasCandidates = menuElements.length > 0;

			return hasSpace && hasPlace && hasCandidates;
		},

		_onActionSelected(event, detail) {
			this._fireAction(detail.item);
			event.currentTarget.selected = undefined;
		},

		_fireAction(item) {

			if (!item || !item.dispatchEvent) {
				return;
			}

			item.dispatchEvent(new window.CustomEvent('action', {
				bubbles: true,
				cancelable: true,
				detail: {
					item: item
				}
			}));
		}
	});
}());
