/* Vacation 3D Map -- Gutenberg-Block ohne Build-Schritt (wp.* Globals statt JSX). */
(function (wp) {
  var el = wp.element.createElement;
  var registerBlockType = wp.blocks.registerBlockType;
  var InspectorControls = wp.blockEditor.InspectorControls;
  var useBlockProps = wp.blockEditor.useBlockProps;
  var Placeholder = wp.components.Placeholder;
  var SelectControl = wp.components.SelectControl;
  var RangeControl = wp.components.RangeControl;
  var PanelBody = wp.components.PanelBody;
  var __ = wp.i18n.__;

  var choices = (window.VACATION3D_MAPS || []).slice();
  var options = [{ value: '', label: __('– Urlaub wählen –', 'vacation3d') }].concat(choices);

  function titleFor(id) {
    for (var i = 0; i < choices.length; i++) if (choices[i].value === id) return choices[i].label;
    return id;
  }

  registerBlockType('vacation3d/map', {
    edit: function (props) {
      var a = props.attributes, set = props.setAttributes;
      var blockProps = useBlockProps({ className: 'vacation3d-editor' });
      var selected = a.vacation || (choices.length === 1 ? choices[0].value : '');
      if (selected && selected !== a.vacation) set({ vacation: selected });

      return el('div', blockProps,
        el(InspectorControls, null,
          el(PanelBody, { title: __('Karte', 'vacation3d'), initialOpen: true },
            el(SelectControl, { label: __('Urlaub', 'vacation3d'), value: selected, options: options,
              onChange: function (v) { set({ vacation: v }); } }),
            el(RangeControl, { label: __('Höhe (px)', 'vacation3d'), value: a.height, min: 240, max: 1200, step: 20,
              onChange: function (v) { set({ height: v }); } }),
            el(RangeControl, { label: __('Zoom (0 = Standard des Urlaubs)', 'vacation3d'),
              help: __('Startzoom der Karte. Kleiner = mehr Überblick; für 700 px breite Beiträge etwa 0.5 weniger als im Vollbild.', 'vacation3d'),
              value: a.zoom, min: 0, max: 16, step: 0.1, onChange: function (v) { set({ zoom: v }); } })
          )
        ),
        el(Placeholder, {
            icon: 'location-alt',
            label: __('Vacation 3D Map', 'vacation3d'),
            instructions: selected
              ? __('Die 3D-Karte wird im Beitrag gerendert. Vorschau: Beitrag ansehen.', 'vacation3d')
              : __('Welcher Urlaub soll gezeigt werden?', 'vacation3d'),
            style: { minHeight: Math.min(a.height, 320) + 'px' }
          },
          el(SelectControl, { value: selected, options: options, onChange: function (v) { set({ vacation: v }); } }),
          selected ? el('p', { className: 'vacation3d-editor__summary' }, '🏔 ' + titleFor(selected) + ' · ' + a.height + ' px' + (a.zoom ? ' · Zoom ' + a.zoom : '')) : null
        )
      );
    },
    save: function () { return null; }   // dynamischer Block, Ausgabe kommt aus PHP
  });
})(window.wp);
