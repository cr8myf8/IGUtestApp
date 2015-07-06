var app 	= require('express')();
var server 	= require('http').Server(app);
var io 		= require('socket.io')(server);
var plotly	= require('plotly')("dowen", "je0mlt1yix");

var serialport = require("serialport");
var SerialPort = serialport.SerialPort; 

/*#######################################
 ### Global Variables  ####
  #########################################*/

var inputVoltage = 14.0;
var getBrdInfo = false;
var dataCollected  = [[],[]]//= ["time","VsenseF","VpanelF","IpanelF","VseqF","IseqF","Temp","Coulombs","errV", "errA", "errAcc","errD","Vcmd","%Oshoot","Kp","Ki","Kd"];
var inputCurrent = [];
var latestCurrent = 0.0;
var collectDataFlag = false;
dataCollected.length=0; // empty array
inputCurrent.length=0;
var dataCount = 0;
var autoCalDataFlag = false;
var autoCaldataCount = 0;
var autoCalData = [];

/*#######################################
 ### myPort is to control the IGU driver  ####
 #########################################*/
var myPort = new SerialPort(process.argv[2], {
   baudRate: 115200,
   // look for return and newline at the end of each data packet:
   parser: serialport.parsers.readline("\r\n")
 }); 
 
/*#######################################
 ### myPort2 is to control an input power supply  ####
 ### This allows you to take data on the input current  ####
 #########################################*/
var myPort2;
if (process.argv.length >3){
   var portName2 = process.argv[3];
   myPort2 = new SerialPort(portName2, {
   baudRate: 9600,
   dataBits: 8,
   parity: 'none',
   stopBits: 2,   
   // look for return and newline at the end of each data packet:
   parser: serialport.parsers.readline("\r\n")
   });
   myPort2.on('open', function () {
	console.log('port open. Data rate: ' + myPort2.options.baudRate);
	myPort2.write("SYST:REM\r\n");
	myPort2.write("*RST\r\n");
	var inputPower = "APPL P25V, "+inputVoltage+", 1.0\r\n";
	myPort2.write(inputPower);
	myPort2.write("OUTP:STAT ON\r\n");
  });
  myPort2.on('data', function (data) {
	latestCurrent = data;
	if (dataCount%20 == 0)myPort2.write("MEAS:CURR:DC? P25V\r\n");   
		dataCount++;
	console.log("latest Current:"+data+":\r\n");
	inputCurrent.push(latestCurrent);
  });
  myPort2.on('close', function (err) {
    console.log('port 2 closed');
  });
 
  myPort2.on('error', function (err) {
    console.error("error port 2", err);
  });
 } 

server.listen(4400);

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});
/*#######################################
 ### wrap all serial communication on websocket connection ####
 ### this allows you to have event interaction between the serial com and webpage  ####
 #########################################*/
io.on('connection', function (socket) {
  console.log("Socket connected"); 
  socket.emit('connected', 123);
 
  socket.on('sendSerial', function(data) {
    console.log("Client sent us: " + data.cmd + "to send to serial");
    myPort.write(data.cmd+"\r\n");
  });
  
  socket.on('off', function (data) {
	var ChanNum =data.chan;
	console.log("command=:"+"*OCV "+ChanNum+":");
    myPort.write("*OCV "+ChanNum+"\r\n");
  });
  
  socket.on('startCh',function(data){
  collectDataFlag = true;
  var ChanNum =data.chan;
  console.log("command=:"+"asp "+ChanNum+":");
  myPort.write("asp "+ChanNum+"\r\n");
  });

  socket.on('stopCh',function(data){
	collectDataFlag = false;
	var ChanNum =data.chan;
	console.log("command=:"+"app "+ChanNum+":");
	myPort.write("app "+ChanNum+"\r\n");
  });
  socket.on('forceVolt',function(data){
	  var volt =data.volt;
	  var minCur =data.minCur;
	  var duration =data.duration;
	  var ChanNum =data.chan;
	  //console.log("chan:"+ChanNum);
	  console.log("command=:"+"*CA "+ChanNum+" "+volt+" "+ minCur+" "+duration+":");
	  myPort.write("*CA "+ChanNum+" "+volt+" "+ minCur+" "+duration+"\r\n");
  });

  socket.on('forceCurrent',function(data){
	  var A         = data.current;
	  var lowVolt   = data.lowVolt;
	  var highVolt  = data.highVolt;
	  var stopCur   = data.stopCur;
	  var maxTime   = data.maxTime;
	  var ChanNum =data.chan;
	  //console.log("chan:"+ChanNum);
	  console.log("command=:"+"*CCCV "+ChanNum+" "+A+" "+ lowVolt+" "+highVolt+" "+stopCur+" "+maxTime+":");
	  myPort.write("*CCCV "+ChanNum+" "+A+" "+ lowVolt+" "+highVolt+" "+stopCur+" "+maxTime+"\r\n");
  });
  socket.on('setGains',function(data){
	  var ChanNum =data.chan;
	  var gains = [data.NVDL,data.PVDL,data.PIDL,data.NIDL,data.KP,data.KI,data.KD]
	  var cmdArr = ["*NVDL ","*PVDL ","*PIDL ","*NIDL ","*KP ","*KI ","*KD "];
	  for (var i =0;i<cmdArr.length;i++){
		console.log(":"+cmdArr[i]+ChanNum+" "+gains[i]+":");
		myPort.write(cmdArr[i]+ChanNum+" "+gains[i]+"\r\n",function(err,byteWritten){
		});
	  }
  });
  
  socket.on('getInfo',function(data){
  var ChanNum =data.chan;
  brdInfo="";
  var cmdArr = ["*GI ","*GUTC ","*GPVDL ","*GNVDL ","*GPIDL ","*GNIDL ","*G4WIRE ","*QGNVDL ","*GKP ","*GKI ","*GKD "];
  //getBrdInfo = cmdArr.length;
  getBrdInfo = true;
	for (var i =0;i<cmdArr.length;i++){
		console.log(":"+cmdArr[i]+ChanNum+":"+getBrdInfo);
		myPort.write(cmdArr[i]+ChanNum+"\r\n",function(err,byteWritten){
		});
	}
  });
  socket.on('getInfoDone',function(data){
	  getBrdInfo = false;
  });
  socket.on('autoCal',function(data){
	autoCalDataFlag = true;
	autoCaldataCount = 0;
	autoCalData.length = 0;
    var ChanNum =data.chan;
    myPort.write("asp "+ChanNum+"\r\n");
	
  });
  socket.on('dataCollectDone',function(data){	
    autoCalDataFlag = false;
    var ChanNum =data.chan;
	myPort.write("app "+ChanNum+"\r\n");
	var Vsense = autoCalData.map(function(value,index) { return parseFloat(value[1]); });
	var Vpanel = autoCalData.map(function(value,index) { return parseFloat(value[2]); });
	var Ipanel = autoCalData.map(function(value,index) { return parseFloat(value[3]); });
	Vsense = Vsense.slice(4);
	Vpanel = Vpanel.slice(4);
	Ipanel = Ipanel.slice(4);
	console.log("Vsen:"+Vsense);
	var VsenseAve = 0.0; var VpanelAve = 0.0; var IpanelAve = 0.0;
	for (var i = 0; i<Vsense.length;i++ ){
		VsenseAve = VsenseAve + Vsense[i];
		VpanelAve = VpanelAve + Vpanel[i];
		IpanelAve = IpanelAve + Ipanel[i];
	}	
	//console.log("Vsen Ave:"+VsenseAve+"::"+"Vpan Ave:"+VpanelAve+"::"+"Ipan Ave:"+IpanelAve);
	//console.log("Vsen len:"+Vsense.length+"::"+"Vpan len:"+Vpanel.length+"::"+"Ipan len:"+Ipanel.length);
	var div = parseFloat(Vsense.length);
	console.log("Vsen len:"+div);
	VsenseAve = VsenseAve / div;
	VpanelAve = VpanelAve / div;
	IpanelAve = IpanelAve / div;
	console.log("Vsen Ave:"+VsenseAve+"::"+"Vpan Ave:"+VpanelAve+"::"+"Ipan Ave:"+IpanelAve);
	var senseCalCode = parseInt(-VsenseAve*10000);
	var pannelCalCode = parseInt(-VpanelAve*10000);
	var currCalCode = parseInt(-IpanelAve*10000);
	console.log("Vsen Ave:"+senseCalCode+"::"+"Vpan Ave:"+pannelCalCode+"::"+"Ipan Ave:"+currCalCode);
	myPort.write("adccaloffset "+ChanNum+" 2 "+senseCalCode+"\r\n");
	myPort.write("adccaloffset "+ChanNum+" 0 "+pannelCalCode+"\r\n");
	myPort.write("adccaloffset "+ChanNum+" 1 "+currCalCode+"\r\n");
  });
  
  socket.on('printArr',function(data){
	var plotName = data.plotName;
	var paramList = data.printList;
	var pList = paramList.split(","); pList[0] = pList[0].slice(1);
	console.log("::"+plotName+"::"+paramList+"::"+pList+"::");
	var time   = dataCollected.map(function(value,index) { return value[0]; });
	var Vsense = dataCollected.map(function(value,index) { return value[1]; });
	var Vpanel = dataCollected.map(function(value,index) { return value[2]; });
	var Ipanel = dataCollected.map(function(value,index) { return value[3]; });
	var Vseq   = dataCollected.map(function(value,index) { return value[4]; });
	var Iseq   = dataCollected.map(function(value,index) { return value[5]; });
	var temp   = dataCollected.map(function(value,index) { return value[6]; });
	var charge = dataCollected.map(function(value,index) { return value[7]; });
	var ErrV   = dataCollected.map(function(value,index) { return value[8]; });
	var errA   = dataCollected.map(function(value,index) { return value[9]; });
	var errAcc = dataCollected.map(function(value,index) { return value[10]; });
	var errD   = dataCollected.map(function(value,index) { return value[11]; });
	var Vcmd   = dataCollected.map(function(value,index) { return value[12]; });
	var Overshoot= dataCollected.map(function(value,index) { return value[13]; });
	var Kp     = dataCollected.map(function(value,index) { return value[14]; });
	var Ki     = dataCollected.map(function(value,index) { return value[15]; });
	var Kd     = dataCollected.map(function(value,index) { return value[16]; });
	var powerOut = dataCollected.map(function(value,index) { return value[2]*value[3]; });
	
	var normalize = time[3];
	var powerIn = [];
	for (var itr =3; itr < time.length; itr++){ //normalize time
		//console.log(time[itr]);
		time[itr] = (time[itr]-normalize);
		powerIn[itr] = inputVoltage*inputCurrent[itr];
		//console.log(time[itr]+":"+normalize);
	}
	//wrap arrays into objects that Plotly understands with config parameters
	var SenseVolt = {x:time.slice(3), y:Vsense.slice(3), name:"sense voltage", mode: "markers", type:"scatter"};//, visible:false};
	var PanelVolt = {x:time.slice(3), y:Vpanel.slice(3), name:"panel voltage", mode: "markers", type:"scatter"};//, visible:false};
	var PanelCur = {x:time.slice(3), y:Ipanel.slice(3),  name:"panel current", yaxis:"y2", mode: "markers", type:"scatter"};//, visible:false};
	var seqVolt = {x:time.slice(3), y:Vseq.slice(3),  name:"seq voltage", mode: "markers", type:"scatter"};//, visible:false};
	var seqCur = {x:time.slice(3), y:Iseq.slice(3),  name:"seq current", yaxis:"y2", mode: "markers", type:"scatter"};//, visible:false};
	var temperature = {x:time.slice(3), y:temp.slice(3),  name:"temperature",yaxis:"y3", mode: "markers", type:"scatter"};//, visible:false};
	var coulomb = {x:time.slice(3), y:charge.slice(3),  name:"charge",yaxis:"y5", mode: "markers", type:"scatter"};//, visible:false};
	var voltError = {x:time.slice(3), y:ErrV.slice(3),  name:"errV",yaxis:"y6", mode: "markers", type:"scatter"};//, visible:false};
	var curError = {x:time.slice(3), y:errA.slice(3),  name:"errA",yaxis:"y6", mode: "markers", type:"scatter"};//, visible:false};
	var accuracyError = {x:time.slice(3), y:errAcc.slice(3),  name:"errAcc",yaxis:"y6", mode: "markers", type:"scatter"};//, visible:false};
	var dError = {x:time.slice(3), y:errD.slice(3),  name:"charge",yaxis:"errD", mode: "markers", type:"scatter"};//, visible:false};
	var cmdVolt = {x:time.slice(3), y:Vcmd.slice(3),  name:"Vcmd", mode: "markers", type:"scatter"};//, visible:false};	
	var overSht = {x:time.slice(3), y:Overshoot.slice(3),  name:"Overshoot",yaxis:"y6", mode: "markers", type:"scatter"};//, visible:false};
	var contP = {x:time.slice(3), y:Kp.slice(3),  name:"Kp",yaxis:"y7", mode: "markers", type:"scatter"};//, visible:false};
	var constI = {x:time.slice(3), y:Ki.slice(3),  name:"Ki",yaxis:"y7", mode: "markers", type:"scatter"};//, visible:false};
	var constD = {x:time.slice(3), y:Kd.slice(3),  name:"Kd",yaxis:"y7", mode: "markers", type:"scatter"};//, visible:false};		
	var inCurr   ={x:time.slice(3), y:inputCurrent.slice(3),  name:"input current",yaxis:"y2", mode: "markers", type:"scatter"};//, visible:false};
	var pIn = {x:time.slice(3), y:powerIn.slice(3),  name:"power in",yaxis:"y4", mode: "markers", type:"scatter"};//, visible:false};
	var pOut = {x:time.slice(3), y:powerOut.slice(3),  name:"power out",yaxis:"y4", mode: "markers", type:"scatter"};//, visible:false};	
	var dataAr = [SenseVolt,PanelVolt,PanelCur,seqVolt,seqCur,temperature,coulomb,voltError,curError,accuracyError,
					dError,cmdVolt,overSht,contP,constI,constD,inCurr,pIn,pOut];

	for (var dItr = 0; dItr<dataAr.length; dItr++){
		if ( parseInt(pList[dItr]) == 1) dataAr[dItr]['visible'] = true;
		else dataAr[dItr]['visible'] = false;
	}

	var layout = {
		title: plotName,
		xaxis: {title: "time (~sec)"}, 
		yaxis: {
			title: "V",
			titlefont: {color: "rgb(148, 103, 189)"},
			tickfont: {color: "rgb(148, 103, 189)"},
			anchor: "free",
			//overlaying: "y",
			side: "left",
			position: 0.11
		},
		yaxis2: {
			title: "A",
			titlefont: {color: "rgb(255, 127, 14)"},
			tickfont: {color: "rgb(255, 127, 14)"},
			anchor: "free",
			overlaying: "y",
			side: "left",
			position: 0.07
		},
		 yaxis3: {
			title: "degC",
			titlefont: {color: "rgb(44, 160, 44)"},
			tickfont: {color: "rgb(44, 160, 44)"},
			anchor: "free",
			overlaying: "y",
			side: "right",
			position: .90
		},
		yaxis4: {
			title: "W",
			titlefont: {color: "rgb(214, 39, 40)"},
			tickfont: {color: "rgb(214, 39, 40)"},
			anchor: "free",
			overlaying: "y",
			side: "right",
			position: 0.88
		},
		yaxis5: {
			title: "Q",
			titlefont: {color: "rgb(148, 103, 189)"},
			tickfont: {color: "rgb(148, 103, 189)"},
			anchor: "free",
			overlaying: "y",
			side: "right",
			position: 0.86
		},
		yaxis6: {
			titlefont: {color: "rgb(140, 86, 75)"},
			tickfont: {color: "rgb(140, 86, 75)"},
			title: "%",
			anchor: "free",
			overlaying: "y",
			side: "right",
			position: 0.84
		},
		yaxis7: {
			title: "const",
			titlefont: {color: "rgb(23, 190, 207)"},
			tickfont: {color: "rgb(23, 190, 207)"},
			anchor: "free",
			overlaying: "y",
			side: "left",
			position: 0.03
		}
	};
	var graphOptions = {layout: layout, filename: plotName, fileopt: "overwrite"};
	plotly.plot(dataAr, graphOptions, function (err, msg) {
		console.log(msg);
		var info = JSON.stringify(msg);
		socket.emit('plotInfo', {info:info});
	});
	//console.log("1:"+dataCollected.length);
	//console.log("2:"+dataCollected[0].length);
	//dataCollected = ["time","VsenseF","VpanelF","IpanelF","VseqF","IseqF","Temp","Coulombs","errV", "errA", "errAcc","errD","Vcmd","%Oshoot","Kp","Ki","Kd"];
  });
  socket.on('clearData',function(data){
    dataCollected.length=0; // empty array
    inputCurrent.length=0;
    dataCount = 0;
    console.log("!!! Data Array Erased");
  });
  
 /*#######################################
 ############ Serial Port Functions ######
 #########################################*/
  myPort.on('data', function (data) {
    //console.log("serial Receive:"+data);
    var mbRec = new Buffer(data, 'utf-8')
	mbRec = mbRec.toString();
    console.log(mbRec);
    //mbRec = mbRec.toString('hex');
    //console.log(mbRec);
    socket.emit('serialData', {serialData:mbRec});
	if(getBrdInfo==true){
	  socket.emit('brdInfo', {serialData:mbRec});
	  //getBrdInfo--;	  	  
	}
	if (collectDataFlag){		
		//if (dataCount%20 == 0)myPort2.write("MEAS:CURR:DC? P25V\r\n");   
		//dataCount++;
		var arr = data.split(",");
		if(arr.length >= 15){
			dataCollected.push(arr);
			inputCurrent.push(latestCurrent);
		}
		//curPoints++;
		//console.log("data collect:"+data);
		//latestData = arr;//arr[1];
		socket.emit('collectData', {serialData:mbRec});
	}
	if (autoCalDataFlag){
		var ar = data.split(",");
		autoCalData.push(ar);
		var tmp = autoCalData.map(function(value,index) { return value[1]; });
		socket.emit('dataCount', {count:tmp.length});
	}
	
  });
  myPort.on('close', function (err) {
    console.log('port closed');
  });
  myPort.on('error', function (err) {
    console.error("error", err);
  });
  myPort.on('open', function () {
    console.log('port opened...');
  }); 
    
});
