"use strict";
var SS = {
  "markers": [],
  "mode": {},
  "constants": {
    "default_marker_size": 10,
    "multip": 20,
    "feelingtextmap": {
      0:   "Very negative",
      25:  "Somewhat negative",
      50:  "Neutral",
      75:  "Somewhat positive",
      100: "Positive"
    },
    "feelingcolourmap": {
      0:   "#d61b38",
      25:  "#ff7f00",
      50:  "#f3b213",
      75:  "#c4ba3d",
      100: "#7fb438"
    },
    "main_type_tags": [
      "Road",
      "Footpath",
      "Cycle lane",
      "Gate/barrier",
      "Road crossing",
      "Junction",
      "Pavement",
      "School or nursery area"
      ],
    "main_issue_tags": [
      "Fast traffic",
      "Not enough space for physical distancing",
      "Can't use without touching",
      "Pavement parking",
      "Pavement clutter",
      "Volume of traffic",
      "Queues outside shops",
      "Bad driving",
      "Long wait to use crossing",
      "No safe way to cross road"
      ],
    "main_solution_tags": [
      "Reduce waiting time to cross",
      "Safer junction",
      "Add crossings",
      "Cut back foliage",
      "Slow down traffic",
      "Remove guard rail",
      "Remove gate/barrier",
      "Make the road access only",
      "Make the crossing automatic",
      "Remove pavement clutter",
      "More space for walking",
      "More space for cycling",
      "Restrict pavement parking",
      "Put down markings for safe queueing",
      "Keep the pavement clear",
      "Reduce speed limit",
      "Add gate/barrier"
      ]
  }
};

SS.onload = function() {
  let feat,i;

  SS.map = L.map('ssmap').setView([53.59, -2.365], 12);

  L.tileLayer("https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}",
    {
      attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
      maxZoom: 18,
      id: 'mapbox/streets-v11',
      tileSize: 512,
      zoomOffset: -1,
      accessToken: 'pk.eyJ1IjoiY3lyaWxsZW1kYyIsImEiOiJjaXl0NzJkeGQwMDI3MnFwbDN5eHZyY3I4In0.wJYBQYQyeLwQRd4m8r9mQQ'
  }).addTo(SS.map);

  // Add bounds polygon
  fetch("data/map_bounds.geojson")
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      L.geoJSON(data, {
        style: function (feature) {
          return {
            fillColor: 'black',
            fillOpacity: 0.1,
            color: 'black',
            weight: 2,
            fillOpacity: 0.2
          };
        }
      }).addTo(SS.map);
    });

  fetch("data/cmnts.json")
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      // split and save as global for access
      let newdata = [];

      for(i in data) {
        feat = data[i];
        if( typeof feat !== 'function') {
          feat.issues = feat.issues.split('_,_');
          feat.solutions = feat.solutions.split('_,_');
          feat.title = feat.title === "NA" ? "Untitled" : feat.title;
          newdata.push(feat);
        }
      }

      SS.data = newdata;
      
      // set visibility to true for all (create a 'truthy' array of same length as data)
      SS.displayed = new Array(newdata.length).fill(true);

      SS.date_range = Array.from(new Set(newdata.map(feat => feat.abdate))).sort();

      // Labels are updated through maker init call to display feelings
      //document.getElementById('date_range_from').innerHTML = SS.date_range[0];
      //document.getElementById('date_range_to').innerHTML = SS.date_range[SS.date_range.length - 1];

      // show all issues
      SS.init_markers();
    })
};

SS.dfilter = function() {
  let cmnts = SS.data;
  let fdisplay = SS.displayed;
  let fmarkers = SS.markers;
  let i,feat,marker;

  let dranger = document.getElementById('date_range');
  let dtvals = dranger.value.split(',');
  let dates_array = SS.date_range;
  let dtlen = dates_array.length;
  let dfstart, dfend, date_start, date_end;

  // translate slider values to dates
  dfstart = dates_array[Math.round((dtlen - 1) * dtvals[0]/100, 10)];
  dfend   = dates_array[Math.round((dtlen - 1) * dtvals[1]/100, 10)];

  date_start = new Date(dfstart);
  date_end   = new Date(dfend);
  
  // update dates on date range filter
  document.getElementById('date_range_from').innerHTML = dfstart;
  document.getElementById('date_range_to').innerHTML = dfend;
  
  for( i in cmnts ) {
    feat = cmnts[i];

    if( typeof feat !== 'function') {
      marker = fmarkers[i];

      if( fdisplay[i] ) {
        if( new Date(feat.abdate) < date_start || date_end < new Date(feat.abdate) ) {
          //console.log("hide " + i);
          marker.setStyle( { fill: false, stroke: false} );
        } else {
          //console.log("show " + i);
          marker.setStyle( { fill: true, stroke: true } );
        }
      }
    }
  }
};

SS.dfilter_reset = function() {
  let dranger = document.getElementById('date_range');
  let dates_array = SS.date_range;

  dranger.value = "0,100";

  // update dates on date range filter
  document.getElementById('date_range_from').innerHTML = dates_array[0];
  document.getElementById('date_range_to').innerHTML = dates_array[dates_array.length - 1];
};

SS.filter = function(event, fset, fvalue) {

  let fmarkers = SS.markers;
  let fdisplay = SS.displayed;
  let cmnts = SS.data;
  let typemap = SS.constants.main_type_tags;
  let issuemap = SS.constants.main_issue_tags;
  let soltnmap = SS.constants.main_solution_tags;
  let i,feat,marker,show_marker,feelcolour;
  let msize = SS.constants.default_marker_size;
  let fcmap = SS.constants.feelingcolourmap;
  let search = "";

  if( !["feeling", "type", "issues", "solutions", "comment", "date_range"].includes(fset) ) {
    console.error("Unknown set '" + fset + "' submitted to SS.filter()")
    return;
  }

  if( fvalue === "input" ) {
    // stop page refresh
    event.preventDefault();

    if( fset === "issues" )    { search = document.getElementById('issues_search').value; }
    if( fset === "solutions" ) { search = document.getElementById('solutions_search').value; }
    if( fset === "comment" )   { search = document.getElementById('comment_search').value; }
  }

  // go through each marker (cmnts)
  for( i in cmnts ) {
    feat = cmnts[i];

    if( typeof feat !== 'function') {
      marker = fmarkers[i];

      // defaults to hidden
      show_marker= false;

      // tag button has been clicked on (not search)
      if( search === "" ) {

        if( fset === "type" )      { show_marker = feat.title.includes(typemap[fvalue]); }
        if( fset === "issues" )    { show_marker = feat.issues.includes(issuemap[fvalue]); }
        if( fset === "solutions" ) { show_marker = feat.solutions.includes(soltnmap[fvalue]); }
        if( fset === "feeling" ) {
          show_marker = (fvalue === "" || feat.feeling === fvalue);
          marker.setStyle({fillOpacity: 1, color: "black", weight: 2, fillColor: fcmap[feat.feeling]})
        }

      } else {
        // input value search

        if( fset === "comment" ) {
          show_marker = feat.comment.toLowerCase().includes(search.toLowerCase()) ||
            feat.title.toLowerCase().includes(search.toLowerCase());
        } else {
          // issues or solutions search
          show_marker = feat[fset].map(itag => itag.toLowerCase().includes(search.toLowerCase())).includes(true);
        }
      }

      if( fvalue === "" ) {
        show_marker = true;
      }

      // display or hide marker
      if( show_marker ) {
        marker.setStyle( { fill: true, stroke: true } );
      } else {
        marker.setStyle( { fill: false, stroke: false} );
      }

      // update visibility data
      fdisplay[i] = show_marker;
    }
  }
  SS.displayed = fdisplay;
  SS.dfilter_reset();
};

SS.resize_symbols = function(value) {
  let fmarkers = SS.markers;
  let cmnts = SS.data;
  let feat,i,marker;
  let msize = SS.constants.default_marker_size;

  for( i in cmnts ) {
    feat = cmnts[i];
    if( typeof feat !== 'function') {
      marker = fmarkers[i];
      if( value === "votes" ) {
        marker.setStyle( {radius: Math.sqrt(SS.constants.multip * (feat.votes + 1) / Math.PI)} );
      } else {
        marker.setStyle( {radius: msize} );
      }
    }
  }
};

SS.init_markers = function() {
  let feat,i;
  let cmnts = SS.data;
  let fmarkers = [];
  let circ;
  let ftm = SS.constants.feelingtextmap;

  for( i in cmnts ) {
    feat = cmnts[i];
    if( typeof feat !== 'function') {
      // L.circle (scales) vs L.circleMarker (always appears same size)
      circ = L.circleMarker([feat.lat, feat.long], {
        color: "black",
        fillColor: '#f03',
        fillOpacity: 0.5,
        weight: 2,
        stroke: true,
        radius: Math.sqrt(SS.constants.multip * (feat.votes+1) / Math.PI)
      }).addTo(SS.map);

      circ.bindPopup("<h4>" + feat.title.replace(/[_],[_]/g, ", ") + "</h4>" +
        "Submitted: " + feat.abdate + "<br>" +
        "Votes: " + feat.votes + "<br>" +
        "Feeling: " + ftm[feat.feeling] + "<br>" +
        "<p>Issues:<br>" + feat.issues.map(i => ("- " + i + "<br>")).toString().replace(/,/g, "") + "</p>" +
        "<p>Suggested " + (feat.wantperm === "Yes" ? "(permanently)" : "") + ":<br>" + 
        feat.solutions.map(s => ("- " + s + "<br>")).toString().replace(/,/g, "")  + "<p>" +
        "<p>Comment:<br>" + feat.comment + "</p>" +
        "<a href='" + feat.url + "' target='_blank'>More info or vote for this</a><br>"
        );

      fmarkers.push(circ);
    }
  }

  // save the markers
  SS.markers = fmarkers;

  // set starting styling
  SS.filter(this, "feeling", "");
};

SS.onload();
