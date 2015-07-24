var util = require('util');
var path = require('path');

function LogerLib(filename) {
  this.filename = filename;
}

LogerLib.prototype.log = function() {
  	
  	var s = util.format.apply(this, arguments);
	//"26/08/2014 18:29:05"
	var dt = new Date();
	
	var day = dt.getDate();
	day = (day < 10) ? "0"+day : day;
	
	var month = dt.getMonth();
	month = (month < 10) ? "0"+month : month;
	
	var year = dt.getFullYear();
	
	var hour = dt.getHours();
	hour = (hour < 10) ? "0"+hour : hour;
	
	var min = dt.getMinutes();
	min = (min < 10) ? "0"+min : min;
	
	var sec = dt.getSeconds();
	sec = (sec < 10) ? "0"+sec : sec;
	
	var make_date = day+"/"+month+"/"+year+" "+hour+":"+min+":"+sec;
	
	console.log(make_date + " [" + path.basename(this.filename || "") + "] " + s);

};

module.exports = LogerLib;
