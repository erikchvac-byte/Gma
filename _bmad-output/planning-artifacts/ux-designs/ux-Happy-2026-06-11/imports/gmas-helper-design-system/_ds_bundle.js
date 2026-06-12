/* @ds-bundle: {"format":3,"namespace":"GmaSHelperDesignSystem_45dd11","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Notice","sourcePath":"components/feedback/Notice.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"SkeletonFeed","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"RangeSlider","sourcePath":"components/forms/RangeSlider.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"}],"sourceHashes":{"assets/icons.js":"00ad183b2552","components/core/Badge.jsx":"26db542d5087","components/core/Button.jsx":"76ea0d4390a9","components/core/Card.jsx":"a80d2fc80ac5","components/core/IconButton.jsx":"74168cea06a0","components/feedback/Notice.jsx":"72a8e42b7c9b","components/feedback/Skeleton.jsx":"cf155da618d7","components/forms/RangeSlider.jsx":"e36a93973392","components/forms/Select.jsx":"af876623951c","components/forms/TextField.jsx":"4bb250ff7c90","ui_kits/app/data.js":"b0de92d32232","ui_kits/app/feed.jsx":"111252204187","ui_kits/app/settings.jsx":"8645049ac090"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.GmaSHelperDesignSystem_45dd11 = window.GmaSHelperDesignSystem_45dd11 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/icons.js
try { (() => {
/* Gma's Helper — self-hosted Lucide icon set (v0.460.0, ISC license).
   Inner SVG paths for the icons used across the system. Recolors via
   currentColor. Usage in React: <Icon name="navigation" size={18} />.
   Plain HTML: gmaIcon('clock', 16) -> SVG string. */
window.GMA_ICONS = {
  "settings": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"></path>\n  <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>",
  "navigation": "<polygon points=\"3 11 22 2 13 21 11 13 3 11\"></polygon>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n  <polyline points=\"12 6 12 12 16 14\"></polyline>",
  "fuel": "<line x1=\"3\" x2=\"15\" y1=\"22\" y2=\"22\"></line>\n  <line x1=\"4\" x2=\"14\" y1=\"9\" y2=\"9\"></line>\n  <path d=\"M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18\"></path>\n  <path d=\"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5\"></path>",
  "percent": "<line x1=\"19\" x2=\"5\" y1=\"5\" y2=\"19\"></line>\n  <circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"></circle>\n  <circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"></circle>",
  "badge-percent": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\"></path>\n  <path d=\"m15 9-6 6\"></path>\n  <path d=\"M9 9h.01\"></path>\n  <path d=\"M15 15h.01\"></path>",
  "chevron-down": "<path d=\"m6 9 6 6 6-6\"></path>",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\"></path>",
  "chevron-left": "<path d=\"m15 18-6-6 6-6\"></path>",
  "x": "<path d=\"M18 6 6 18\"></path>\n  <path d=\"m6 6 12 12\"></path>",
  "check": "<path d=\"M20 6 9 17l-5-5\"></path>",
  "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n  <line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"></line>\n  <line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"></line>",
  "triangle-alert": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"></path>\n  <path d=\"M12 9v4\"></path>\n  <path d=\"M12 17h.01\"></path>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n  <path d=\"M12 16v-4\"></path>\n  <path d=\"M12 8h.01\"></path>",
  "arrow-right": "<path d=\"M5 12h14\"></path>\n  <path d=\"m12 5 7 7-7 7\"></path>",
  "map-pin": "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"></path>\n  <circle cx=\"12\" cy=\"10\" r=\"3\"></circle>",
  "search": "<circle cx=\"11\" cy=\"11\" r=\"8\"></circle>\n  <path d=\"m21 21-4.3-4.3\"></path>",
  "sliders-horizontal": "<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\"></line>\n  <line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\"></line>\n  <line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\"></line>\n  <line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\"></line>\n  <line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\"></line>\n  <line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\"></line>\n  <line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\"></line>\n  <line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\"></line>\n  <line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\"></line>",
  "car": "<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\"></path>\n  <circle cx=\"7\" cy=\"17\" r=\"2\"></circle>\n  <path d=\"M9 17h6\"></path>\n  <circle cx=\"17\" cy=\"17\" r=\"2\"></circle>",
  "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"></path>\n  <path d=\"m9 12 2 2 4-4\"></path>"
};
window.gmaIcon = function (name, size, strokeWidth) {
  var inner = window.GMA_ICONS[name] || '';
  var s = size || 24;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (strokeWidth || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
};
if (typeof React !== 'undefined') {
  window.Icon = function Icon(props) {
    var name = props.name,
      size = props.size || 24,
      sw = props.strokeWidth || 2;
    return React.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: sw,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      style: props.style,
      className: props.className,
      dangerouslySetInnerHTML: {
        __html: window.GMA_ICONS[name] || ''
      }
    });
  };
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/icons.js", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — a small status / category pill.
 * `fresh` and `stale` show a leading dot; `urgent` is the amber
 * happy-hour marker; `discount` is the solid-green percentage chip.
 */
function Badge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
  ...rest
}) {
  const showDot = dot || variant === 'fresh' || variant === 'stale';
  const classes = ['gma-badge', `gma-badge--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: classes
  }, rest), showDot && /*#__PURE__*/React.createElement("span", {
    className: "gma-badge__dot",
    "aria-hidden": "true"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the primary action affordance for Gma's Helper.
 * Primary is the single confident green "go" button (the one the
 * age gate and settings sheet use). Secondary/ghost stay quiet so
 * the green never has to compete.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  href,
  disabled = false,
  className = '',
  ...rest
}) {
  const classes = ['gma-btn', `gma-btn--${variant}`, size === 'sm' ? 'gma-btn--sm' : '', block ? 'gma-btn--block' : '', className].filter(Boolean).join(' ');
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, iconLeft, children != null && /*#__PURE__*/React.createElement("span", null, children), iconRight);
  if (href && !disabled) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href,
      className: classes
    }, rest), content);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: classes,
    disabled: disabled
  }, rest), content);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the brand's core surface: a hairline border on white.
 * Flat by default (no drop shadow); `interactive` adds a quiet
 * hover lift, `urgent` tints it amber for time-sensitive content.
 */
function Card({
  children,
  padding = 'default',
  interactive = false,
  urgent = false,
  as = 'div',
  className = '',
  ...rest
}) {
  const Tag = as;
  const classes = ['gma-card', padding === 'flush' ? 'gma-card--flush' : '', padding === 'roomy' ? 'gma-card--roomy' : '', interactive ? 'gma-card--interactive' : '', urgent ? 'gma-card--urgent' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: classes
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — a square, label-free control for icon-only actions
 * (the settings gear, a close X, chevrons). Always pass `aria-label`.
 */
function IconButton({
  children,
  size = 'md',
  outlined = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = ['gma-iconbtn', size === 'sm' ? 'gma-iconbtn--sm' : '', outlined ? 'gma-iconbtn--outlined' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: classes
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Notice.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Notice — an inline message line. `muted` is the non-intrusive
 * "N sources unavailable" / "Last updated" treatment (no box);
 * `error` and `urgent` get tinted containers. Pass `icon` for a
 * leading glyph.
 */
function Notice({
  children,
  variant = 'default',
  icon = null,
  role,
  className = '',
  ...rest
}) {
  const classes = ['gma-notice', `gma-notice--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("p", _extends({
    className: classes,
    role: role
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "gma-notice__icon",
    "aria-hidden": "true"
  }, icon), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { Notice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Notice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Skeleton — a pulsing placeholder block. The deal feed shows three
 * 64px-tall skeletons while loading; compose your own with `width`,
 * `height`, and `radius`.
 */
function Skeleton({
  width = '100%',
  height = 16,
  radius,
  className = '',
  style,
  ...rest
}) {
  const px = v => typeof v === 'number' ? `${v}px` : v;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['gma-skeleton', className].filter(Boolean).join(' '),
    style: {
      width: px(width),
      height: px(height),
      ...(radius != null ? {
        borderRadius: px(radius)
      } : null),
      ...style
    },
    "aria-hidden": "true"
  }, rest));
}

/**
 * SkeletonFeed — the exact loading state of the deal feed: N stacked
 * card-height skeletons inside a status region.
 */
function SkeletonFeed({
  rows = 3
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-label": "Loading deals",
    style: {
      display: 'grid',
      gap: 'var(--gap-feed)'
    }
  }, Array.from({
    length: rows
  }).map((_, i) => /*#__PURE__*/React.createElement(Skeleton, {
    key: i,
    height: 64
  })));
}
Object.assign(__ds_scope, { Skeleton, SkeletonFeed });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/forms/RangeSlider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RangeSlider — the distance filter, generalized. Shows a label and
 * a live mono value above the track, optional min/max tick labels
 * below. Controlled: pass `value` + `onChange(number)`.
 */
function RangeSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  valueText,
  showTicks = false,
  minLabel,
  maxLabel,
  id,
  className = '',
  ...rest
}) {
  const autoId = React.useId();
  const inputId = id || autoId;
  const classes = ['gma-range', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: classes
  }, /*#__PURE__*/React.createElement("div", {
    className: "gma-range__top"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "gma-range__label",
    htmlFor: inputId
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "gma-range__value"
  }, valueText != null ? valueText : value)), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    className: "gma-range__input",
    type: "range",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange && onChange(Number(e.target.value))
  }, rest)), showTicks && /*#__PURE__*/React.createElement("div", {
    className: "gma-range__ticks"
  }, /*#__PURE__*/React.createElement("span", null, minLabel != null ? minLabel : min), /*#__PURE__*/React.createElement("span", null, maxLabel != null ? maxLabel : max)));
}
Object.assign(__ds_scope, { RangeSlider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RangeSlider.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — native select with brand chrome. Used for the optional
 * precision mode (year / make / model). Pass `options` as
 * [{value,label}] or use children for full control.
 */
function Select({
  label,
  options,
  placeholder,
  id,
  className = '',
  children,
  ...rest
}) {
  const autoId = React.useId();
  const selectId = id || autoId;
  const field = /*#__PURE__*/React.createElement("select", _extends({
    id: selectId,
    className: "gma-select"
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), options ? options.map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt.value,
    value: opt.value
  }, opt.label)) : children);
  if (!label) return /*#__PURE__*/React.createElement("div", {
    className: className
  }, field);
  return /*#__PURE__*/React.createElement("div", {
    className: ['gma-field', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("label", {
    className: "gma-field__label",
    htmlFor: selectId
  }, label), field);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * TextField — label + input + optional hint/error. Set `mono` for
 * numeric entry (vehicle MPG) so figures align with the rest of
 * the honest math.
 */
function TextField({
  label,
  hint,
  error,
  mono = false,
  id,
  className = '',
  ...rest
}) {
  const autoId = React.useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  const inputClasses = ['gma-input', mono ? 'gma-input--mono' : ''].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: ['gma-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "gma-field__label",
    htmlFor: inputId
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    className: inputClasses,
    "aria-invalid": error ? 'true' : undefined,
    "aria-describedby": describedBy
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    id: `${inputId}-err`,
    className: "gma-field__error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    id: `${inputId}-hint`,
    className: "gma-field__hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/data.js
try { (() => {
/* Gma's Helper — sample deal data for the UI kit.
   Shape mirrors the real API (server/data/data.json): a meta block
   plus dispensaries, each with deals. Distances are real R&D values;
   gas cost is computed live from the honest formula, not hardcoded. */

window.GMA_DATA = {
  meta: {
    gasPrice: 4.25,
    // $/gal — EIA daily (ADR-012)
    nationalMpg: 28,
    // US fleet average (ADR-013)
    lastUpdated: 'Jun 10, 7:45 AM'
  },
  // staleCount derives from the full API array, independent of the radius (ADR-026)
  staleCount: 2,
  dispensaries: [{
    id: 'remedy-tulalip',
    name: 'Remedy Tulalip',
    distanceMiles: 2.5,
    stale: false,
    deals: [{
      type: 'happy_hour',
      description: 'Top-shelf flower, every gram',
      discountPct: 30,
      window: '8:00 PM – 10:00 PM',
      countdownMin: 24
    }]
  }, {
    id: 'kush21-everett',
    name: 'Kush21 Everett (Evergreen Way)',
    distanceMiles: 9.8,
    stale: false,
    deals: [{
      type: 'happy_hour',
      description: 'House pre-rolls & vape carts',
      discountPct: 20,
      window: '9:00 PM – close',
      countdownMin: null
    }]
  }, {
    id: 'the-joint-everett',
    name: 'The Joint — Everett',
    distanceMiles: 10.5,
    stale: false,
    deals: [{
      type: 'happy_hour',
      description: 'Live resin, select brands',
      discountPct: 35,
      window: '7:00 PM – 9:30 PM',
      countdownMin: 96
    }]
  }, {
    id: 'jet-cannabis',
    name: 'Jet Cannabis',
    distanceMiles: 12.5,
    stale: false,
    deals: [{
      type: 'daily',
      description: 'Edibles — brand of the day',
      discountPct: 25,
      window: 'Active today',
      countdownMin: null
    }]
  }, {
    id: 'wild-seed',
    name: 'Wild Seed Wellness',
    distanceMiles: 31.0,
    stale: false,
    deals: [{
      type: 'daily',
      description: 'Storewide flower',
      discountPct: 40,
      window: 'Active today',
      countdownMin: null
    }]
  }]
};

/* roundTripGasCost — the ONE home of the formula (mirrors gasCost.ts, ADR-024):
   (distanceMiles × 2) × (gasPrice / mpg). null on any non-finite/≤0 input. */
window.roundTripGasCost = function (distanceMiles, gasPrice, mpg) {
  if (![distanceMiles, gasPrice, mpg].every(n => typeof n === 'number' && isFinite(n) && n > 0)) return null;
  const cost = distanceMiles * 2 * (gasPrice / mpg);
  return isFinite(cost) ? cost : null;
};
window.formatGasCost = function (cost) {
  return cost == null ? null : '$' + cost.toFixed(2);
};

/* sortDeals — flatten to rows, then tier (mirrors sortDeals.ts, ADR-022):
   timed happy hours by countdown asc, then null-window happy hours,
   then daily deals by discount desc. */
window.sortGmaRows = function (dispensaries) {
  const rows = [];
  dispensaries.forEach(d => d.deals.forEach(deal => rows.push({
    dispensary: d,
    deal
  })));
  const tier = r => r.deal.type === 'happy_hour' && r.deal.countdownMin != null ? 0 : r.deal.type === 'happy_hour' ? 1 : 2;
  return rows.sort((a, b) => {
    const ta = tier(a),
      tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return a.deal.countdownMin - b.deal.countdownMin;
    if (ta === 2) return b.deal.discountPct - a.deal.discountPct;
    return 0;
  });
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/data.js", error: String((e && e.message) || e) }); }

// ui_kits/app/feed.jsx
try { (() => {
/* Gma's Helper — UI kit app components.
   Composes the design-system primitives (window.GmaSHelperDesignSystem_45dd11)
   into the real product surfaces: age gate, header, deal feed, deal card,
   distance filter, and the vehicle-precision settings sheet.
   This is a faithful recreation of the app in Happy/client/src — simplified
   for presentation, not production. */

const DS = window.GmaSHelperDesignSystem_45dd11;
const {
  Button,
  IconButton,
  Badge,
  Card,
  RangeSlider,
  Notice,
  Select,
  TextField,
  SkeletonFeed
} = DS;

/* ---------------------------------------------------------------
   Age gate — full-screen attestation (AgeGate.tsx / ADR-021)
   --------------------------------------------------------------- */
function AgeGate({
  onConfirm
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "alertdialog",
    "aria-modal": "true",
    "aria-labelledby": "age-gate-heading",
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-6)',
      padding: 'var(--space-6)',
      textAlign: 'center',
      background: 'var(--surface-inverse)',
      color: 'var(--text-on-inverse)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--green-300)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 36
  })), /*#__PURE__*/React.createElement("h1", {
    id: "age-gate-heading",
    style: {
      color: '#fff',
      fontWeight: 'var(--weight-regular)',
      fontSize: 'var(--text-lg)',
      lineHeight: 'var(--leading-snug)',
      maxWidth: 320
    }
  }, "You must be 21 or older to view this content."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onConfirm,
    autoFocus: true
  }, "I am 21 or older"));
}

/* ---------------------------------------------------------------
   Header — wordmark + settings gear
   --------------------------------------------------------------- */
function Header({
  onOpenSettings
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-3)',
      padding: 'var(--space-4)',
      borderBottom: '1px solid var(--border-default)',
      background: 'var(--surface-card)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 9,
      background: 'var(--green-700)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "navigation",
    size: 18,
    strokeWidth: 2.25
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xl)',
      fontWeight: 'var(--weight-bold)',
      letterSpacing: '-0.01em',
      color: 'var(--text-strong)'
    }
  }, "Gma's Helper")), /*#__PURE__*/React.createElement(IconButton, {
    "aria-label": "Vehicle & settings",
    onClick: onOpenSettings
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    size: 20
  })));
}

/* ---------------------------------------------------------------
   Deal card — presentational (DealCard.tsx / ADR-009, ADR-023)
   --------------------------------------------------------------- */
function DealCard({
  row,
  gasCostText
}) {
  const {
    dispensary,
    deal
  } = row;
  const isHappyHour = deal.type === 'happy_hour';
  return /*#__PURE__*/React.createElement(Card, {
    as: "article",
    urgent: isHappyHour,
    style: {
      display: 'grid',
      gap: 'var(--space-1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, dispensary.name), /*#__PURE__*/React.createElement("span", {
    "data-figure": true,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap'
    }
  }, dispensary.distanceMiles.toFixed(1), " mi")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      marginBottom: 2
    }
  }, isHappyHour ? /*#__PURE__*/React.createElement(Badge, {
    variant: "urgent"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 12
  }), " Happy hour") : /*#__PURE__*/React.createElement(Badge, {
    variant: "neutral"
  }, "Daily deal")), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--text-body)'
    }
  }, deal.description), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 'var(--weight-medium)',
      color: 'var(--text-strong)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--green-700)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, deal.discountPct, "% off"), gasCostText && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-body)'
    }
  }, ' ', "\u2014 ", /*#__PURE__*/React.createElement("span", {
    "data-figure": true,
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, gasCostText), " to get there")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-2)',
      marginTop: 2
    }
  }, deal.window && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)'
    }
  }, deal.window), deal.countdownMin != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-urgent)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 14
  }), /*#__PURE__*/React.createElement("span", {
    "data-figure": true,
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, formatCountdown(deal.countdownMin)), " left")));
}
function formatCountdown(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/* ---------------------------------------------------------------
   Deal feed — distance filter + sorted rows + footnotes
   --------------------------------------------------------------- */
function DealFeed({
  data,
  maxDistance,
  setMaxDistance,
  mpg,
  loading
}) {
  const fresh = data.dispensaries.filter(d => !d.stale);
  const nearby = fresh.filter(d => d.distanceMiles <= maxDistance);
  const rows = window.sortGmaRows(nearby);
  const gasText = miles => window.formatGasCost(window.roundTripGasCost(miles, data.meta.gasPrice, mpg));
  return /*#__PURE__*/React.createElement("section", {
    "aria-label": "Deal feed",
    style: {
      padding: 'var(--space-4)',
      display: 'grid',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(RangeSlider, {
    label: "Within",
    value: maxDistance,
    onChange: setMaxDistance,
    min: 1,
    max: 50,
    valueText: `${maxDistance} ${maxDistance === 1 ? 'mile' : 'miles'}`,
    showTicks: true,
    minLabel: "1 mi",
    maxLabel: "50 mi"
  }), loading ? /*#__PURE__*/React.createElement(SkeletonFeed, {
    rows: 3
  }) : rows.length === 0 ? /*#__PURE__*/React.createElement(Notice, {
    variant: "muted",
    role: "status",
    "aria-live": "polite"
  }, "No active deals right now") : /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'grid',
      gap: 'var(--gap-feed)'
    }
  }, rows.map(row => /*#__PURE__*/React.createElement("li", {
    key: `${row.dispensary.id}|${row.deal.description}`
  }, /*#__PURE__*/React.createElement(DealCard, {
    row: row,
    gasCostText: gasText(row.dispensary.distanceMiles)
  })))), !loading && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 'var(--space-1)'
    }
  }, /*#__PURE__*/React.createElement(Notice, {
    variant: "muted"
  }, "Last updated ", data.meta.lastUpdated), data.staleCount > 0 && /*#__PURE__*/React.createElement(Notice, {
    variant: "muted",
    role: "status"
  }, data.staleCount, " ", data.staleCount === 1 ? 'source' : 'sources', " unavailable")));
}
Object.assign(window, {
  AgeGate,
  Header,
  DealCard,
  DealFeed,
  formatCountdown
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/feed.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/settings.jsx
try { (() => {
/* Gma's Helper — vehicle precision settings sheet.
   The optional "dial it in to your car" flow (brief / ADR-003): pick
   year / make / model once, persisted. Default path needs zero setup —
   gas cost uses the national average until a vehicle is chosen. */

const SDS = window.GmaSHelperDesignSystem_45dd11;
function SettingsSheet({
  open,
  onClose,
  vehicle,
  setVehicle,
  nationalMpg
}) {
  const {
    Button,
    IconButton,
    Select,
    Notice
  } = SDS;
  const [draft, setDraft] = React.useState(vehicle);
  React.useEffect(() => {
    if (open) setDraft(vehicle);
  }, [open]);
  if (!open) return null;
  const years = ['2024', '2023', '2022', '2021', '2020'];
  const makes = ['Toyota', 'Honda', 'Ford', 'Subaru', 'Chevrolet'];
  const models = {
    Toyota: ['Corolla', 'RAV4', 'Tacoma'],
    Honda: ['Civic', 'CR-V', 'Accord'],
    Ford: ['F-150', 'Escape', 'Maverick'],
    Subaru: ['Outback', 'Forester', 'Crosstrek'],
    Chevrolet: ['Silverado', 'Equinox', 'Malibu']
  };
  // toy MPG estimate just for the mock
  const estMpg = draft.year && draft.make && draft.model ? mockMpg(draft.make, draft.model) : null;
  const complete = draft.year && draft.make && draft.model;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(17,24,39,0.45)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Vehicle settings",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--surface-card)',
      borderTopLeftRadius: 'var(--radius-2xl)',
      borderTopRightRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-lg)',
      padding: 'var(--space-5)',
      display: 'grid',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--green-700)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "car",
    size: 20
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, "Your vehicle")), /*#__PURE__*/React.createElement(IconButton, {
    "aria-label": "Close",
    size: "sm",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 18
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, "Set it once for exact gas math. Skip it and we use the national average (", nationalMpg, " MPG)."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Year",
    placeholder: "Year",
    value: draft.year,
    options: years.map(y => ({
      value: y,
      label: y
    })),
    onChange: e => setDraft({
      ...draft,
      year: e.target.value
    })
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Make",
    placeholder: "Make",
    value: draft.make,
    options: makes.map(m => ({
      value: m,
      label: m
    })),
    onChange: e => setDraft({
      ...draft,
      make: e.target.value,
      model: ''
    })
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Model",
    placeholder: "Model",
    value: draft.model,
    disabled: !draft.make,
    options: (models[draft.make] || []).map(m => ({
      value: m,
      label: m
    })),
    onChange: e => setDraft({
      ...draft,
      model: e.target.value
    })
  })), estMpg && /*#__PURE__*/React.createElement(Notice, {
    variant: "default",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "fuel",
      size: 16
    })
  }, "Estimated ", /*#__PURE__*/React.createElement("strong", null, estMpg, " MPG"), " \u2014 gas cost will use your vehicle."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    block: true,
    onClick: () => {
      setVehicle({
        year: '',
        make: '',
        model: '',
        mpg: null
      });
      onClose();
    }
  }, "Use national average"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    disabled: !complete,
    onClick: () => {
      setVehicle({
        ...draft,
        mpg: estMpg
      });
      onClose();
    }
  }, "Save vehicle"))));
}
function mockMpg(make, model) {
  const heavy = ['F-150', 'Silverado', 'Tacoma'];
  if (heavy.includes(model)) return 21;
  if (['RAV4', 'CR-V', 'Escape', 'Forester', 'Outback', 'Equinox', 'Crosstrek'].includes(model)) return 29;
  return 34;
}
Object.assign(window, {
  SettingsSheet,
  mockMpg
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/settings.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Notice = __ds_scope.Notice;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.SkeletonFeed = __ds_scope.SkeletonFeed;

__ds_ns.RangeSlider = __ds_scope.RangeSlider;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.TextField = __ds_scope.TextField;

})();
