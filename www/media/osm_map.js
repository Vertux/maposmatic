/* coding: utf-8
 *
 * maposmatic, the web front-end of the MapOSMatic city map generation system
 * Copyright (C) 2009 David Decotigny
 * Copyright (C) 2009 Frédéric Lehobey
 * Copyright (C) 2009 David Mentré
 * Copyright (C) 2009 Maxime Petazzoni
 * Copyright (C) 2009 Thomas Petazzoni
 * Copyright (C) 2009 Gaël Utard
 * Copyright (C) 2009 Étienne Loks
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * See the file COPYING for details.
 */

/* OSM slippy map management. */

var map = null;
var update_lock = 0;
var epsg_display_projection = new OpenLayers.Projection('EPSG:4326');
var epsg_projection = new OpenLayers.Projection('EPSG:900913');

function getUpperLeftLat() { return document.getElementById('lat_upper_left'); }
function getUpperLeftLon() { return document.getElementById('lon_upper_left'); }
function getBottomRightLat() { return document.getElementById('lat_bottom_right'); }
function getBottomRightLon() { return document.getElementById('lon_bottom_right'); }

/** Map Zoom/Move events callback: update form fields on zoom action. */
function updateForm()
{
    if (update_lock)
      return;

    var bounds = map.getExtent();

    var topleft = new OpenLayers.LonLat(bounds.left, bounds.top);
    topleft = topleft.transform(epsg_projection, epsg_display_projection);

    var bottomright = new OpenLayers.LonLat(bounds.right, bounds.bottom);
    bottomright = bottomright.transform(epsg_projection, epsg_display_projection);

    getUpperLeftLat().value = topleft.lat.toFixed(4);
    getUpperLeftLon().value = topleft.lon.toFixed(4);
    getBottomRightLat().value = bottomright.lat.toFixed(4);
    getBottomRightLon().value = bottomright.lon.toFixed(4);
}

/* Update the map on form field modification. */
function updateMap()
{
    var bounds = new OpenLayers.Bounds(getUpperLeftLon().value,
                                       getUpperLeftLat().value,
                                       getBottomRightLon().value,
                                       getBottomRightLat().value);
    bounds.transform(epsg_display_projection, epsg_projection);

    update_lock = 1;
    map.zoomToExtent(bounds);
    update_lock = 0;
}

/* Main initialisation function. Must be called before the map is manipulated. */
function mapInit()
{
    map = new OpenLayers.Map ('map', {
        controls:[new OpenLayers.Control.Navigation(),
                  new OpenLayers.Control.PanZoomBar(),
                  new OpenLayers.Control.Attribution()],
        maxExtent: new OpenLayers.Bounds(-20037508.34,-20037508.34,20037508.34,20037508.34),
        numZoomLevels: 18,
        maxResolution: 156543.0399,
        projection: epsg_projection,
        displayProjection: epsg_display_projection
    } );

    layerTilesMapnik = new OpenLayers.Layer.OSM.Mapnik("Mapnik");
    map.addLayer(layerTilesMapnik);

    map.events.register('zoomend', map, updateForm);
    map.events.register('moveend', map, updateForm);
    updateMap();
}

function setFormActivation(active) {
  if (active) {
    $('#map_language').show();
    $('#id_go_next_btn').show()
      .removeAttr('disabled');
  } else {
    $('#map_language').hide();
    $('#id_go_next_btn').hide()
      .attr('disabled', 'disabled');
  }
}


/** Language list management. */
var languages;

function resetLanguages() {
  $('#id_map_language').html(languages);
  $('#id_map_language').children('option').each(function() {
    if ($(this).val() == 'C')
      $(this).attr('selected', 'selected');
  });
}

function preselectLanguage(country) {
  var seen = false;

  $('#id_map_language').html(languages);
  $('#id_map_language').children('option').each(function() {
    if (! ($(this).val().match('.._' + country.toUpperCase() + '\..*') != null
           || $(this).val() == 'C'))
      $(this).remove();
    else if (!seen) {
      $(this).attr('selected', 'selected');
      seen = true;
    }
  });
}


/** Auto-suggest feature. */
function suggest(input, results, osm_id, button, options) {
  var $input = $(input).attr('autocomplete', 'off');
  var $results = $(results);
  var $osm_id = $(osm_id);
  var $button = $(button);
  var timeout = false;
  var shown = false;

  closeSuggest(true);

  // Setup the keyup event.
  $input.keyup(processKey);

  // Disable form validation via the Enter key
  $input.keypress(function(e) { if (e.keyCode == 13) return false; });

  function appendValidResult(item) {
    var id = 'rad_' + item.country_code + '_' + item.ocitysmap_params['id'];
    $results.append('<li class="suggestok" id="' + id + '">'
       + item.display_name + '</li>');

    var e = $('#' + id)
    e.bind('click', function(e) { setResult($(this)); });
    e.bind('mouseover', function(e) { setSelectedResultTo($(this)); });
  }

  /* Empty and close the suggestion box. */
  function closeSuggest(hide) {
    $results.empty();

    if (hide)
      $results.hide();
    else
      $results.show();

    shown = !hide;
  }

  /* Handle the JSON result. */
  function handleNominatimResults(data, textResult) {
    var unusable_token = false;
    $(input).css('cursor', 'text');
    closeSuggest(false);

    if (!data.length) {
      $results.append('<li class="info">' + $('#noresultsinfo').html() + '</li>');
      return;
    }

    $.each(data, function(i, item) {
      if (typeof item.ocitysmap_params != 'undefined' &&
          item.ocitysmap_params['admin_level'] == 8) {
        appendValidResult(item);
      } else {
        $results.append('<li class="suggestoff">'
          + item.display_name + '</li>');
        unusable_token = true;
      }
    });

    if (unusable_token)
      $results.append('<li class="info">' + $('#noadminlimitinfo').html() + '</li>');
  }

  function doQuery() {
    if (!$input.val().length) {
      closeSuggest(true);
      return;
    }
    $(input).css('cursor', 'wait');
    $.getJSON("/nominatim/", { q: $input.val() }, handleNominatimResults);
  }

  function processKey(e) {
    if (e.keyCode != 13) {
      clearResult();
    } else {
      if ($osm_id.val() != '')
        $button.click();
    }

    switch (e.keyCode) {
      case 27:  // ESC
        closeSuggest(true);
        break;
      case 9:   // TAB
      case 13:  // OK
        var elt = getCurrentResult();
        if (elt)
          setResult(elt);
        return false;
        break;
      case 38:  // UP
        if (!shown)
          doQuery();
        prevResult();
        break;
      case 40:  // DOWN
        if (!shown)
          doQuery();
        nextResult();
        break;
      default:
        if (timeout)
          clearTimeout(timeout);
        timeout = setTimeout(doQuery, options.timeout);
      }
  }

  /* Returns the currently selected result. */
  function getCurrentResult() {
    var children = $results.children('li.' + options.selectedClass);
    if (children.length)
      return children;
    return false;
  }

  /* Set the form to the given result. */
  function setResult(elt) {
    var temp = elt.attr('id').split('_');

    preselectLanguage(temp[1]);
    $osm_id.val(temp[2]);
    $input.val(elt.html());

    closeSuggest(true);
    setFormActivation(true);
  }

  function clearResult() {
    $osm_id.val('');
    setFormActivation(false);
  }

  /** Functions to manipulate the current selection. */

  /* Set the currently selected item in the drop-down list. */
  function setSelectedResultTo(elt) {
    $results.children('li').removeClass(options.selectedClass);
    if (elt)
      elt.addClass(options.selectedClass);
  }

  /* Move to the previous valid result. */
  function prevResult() {
    var current = getCurrentResult();
    var new_result;

    if (current) {
      var prev_valid = current.siblings('li.suggestok');
      if (prev_valid.length)
        new_result = prev_valid;
    } else {
      new_result = $results.children('li.suggestok:last');
    }

    setSelectedResultTo(new_result);
  }

  /* Move to the next valid result. */
  function nextResult() {
    var current = getCurrentResult();
    var new_result;

    if (current) {
      var next_valid = current.siblings('li.suggestok');
      if (next_valid.length)
        new_result = next_valid;
    } else {
      new_result = $results.children('li.suggestok:first');
    }

    setSelectedResultTo(new_result);
  }
}

/** Page initialization. */
$(document).ready(function() {
  languages = $('#id_map_language').html();

  function switchToAdminMode() {
    $('#mapform tbody').children('tr.bybbox').hide();
    $('#mapform tbody').children('tr.byadmin').show();
    setFormActivation(false);
  }

  function switchToBBoxMode() {
    $('#mapform tbody').children('tr.byadmin').hide();
    $('#mapform tbody').children('tr.bybbox').show();
    setFormActivation(true);
    if (map == null)
      mapInit();
    resetLanguages();
  }

  if ($('#id_mode_1').is(':checked'))
    switchToBBoxMode();
  else
    switchToAdminMode();

  $('#id_mode_0').bind('click', function(e) { switchToAdminMode(); });
  $('#id_mode_1').bind('click', function(e) { switchToBBoxMode(); });

  suggest('#id_administrative_city', '#suggest',
          '#id_administrative_osmid', '#id_go_next_btn',
          { selectedClass: 'selected',
            timeout: 150
          });
});
