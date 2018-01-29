var alphaVantageApiKey = "YL2ZW27QRI0W8S48";
var alphaVantageApiString = "https://www.alphavantage.co/query?";
var portCount = 0;
var refreshRate = 300 // in second
var expiredDuration = 7200 // in second

$(document).ready(function() {
	if (typeof(Storage) !== undefined) {
		// clear local storage if user has not used the program for a long time
		if (localStorage.lastRefreshStock) {
			let utcNow = getUtcNow();
			let lastRefreshDateTime = new Date(localStorage.lastRefreshStock);
			let diffInSeconds = (utcNow.getTime() - lastRefreshDateTime.getTime()) / 1000;
			if (diffInSeconds > expiredDuration) { 
				localStorage.clear();
			}
		}

		// get currency rate between USD and EUR
		getCurrencyExchangeRate();

		// update data value of stocks every X minute to improve performance
		if (localStorage.lastRefreshStock) {
			refreshData(refreshRate);
		}

		// populate data
		populatePortfoliosHTML();
	}

	// disable the add button if user already has 10 portfolios
	if (portCount == 10) {
		$("#addButton").prop("disabled", true);
	}

	$('.stockTable tbody').on('click', 'tr', function() {
		if ($(this).hasClass("selected")) {
			$(this).removeClass("selected");
			$(this).find("input.select-checkbox").prop("checked", false)
		} else {
			$(this).addClass("selected");
			$(this).find("input.select-checkbox").prop("checked", true)
		}

		let thisTable = $(this).parent().parent().DataTable(); // this table
		let contentWrapper = $($(this).parents()[6]) // this port's content
		let removeStockButton = contentWrapper.find("button.remove-stock-button") // get the remove stock button
		if (thisTable.rows('.selected').data().length > 0)
			removeStockButton.prop("disabled", false);
		else removeStockButton.prop("disabled", true);
	});

	$("#refreshButton").on("click", function() {
		refreshData(refreshRate);
		location.reload();
	});

	$(".delete-button").on("click", function (e) {
		// get the id of that portfolio
		let portId = e.currentTarget.getAttribute("target-portfolio");
		if (localStorage.portfolios) {
			let ports = JSON.parse(localStorage.portfolios);
			let portfolioToDelete = {};
			$.each(ports, function(i, element) {
				if (element['id'] == portId)
					portfolioToDelete = element;
			});

			if (portfolioToDelete) {
				let index = ports.indexOf(portfolioToDelete);
				ports.splice(index, 1);
				let str = JSON.stringify(ports);
				localStorage.setItem("portfolios", str);

				// refresh page
				location.reload();
			}
		}
	});

	$(".add-stock-button").on("click", function(e) {
		// get the id of that portfolio
		let targetPortId = e.currentTarget.getAttribute("target-portfolio");
		let ports = JSON.parse(localStorage.portfolios);
		let currentPort = {};
		$.each(ports, function(i, element) {
			if (element['id'] == targetPortId)
				currentPort = element;
		});
		// check amount of stocks
		if (currentPort["stocks"].length < 50) {
			$('#addStockModal').modal();
			$("#stockPortId").text(targetPortId);
		} else {
			$('#errorModal').modal();
			$("#errorDiv").text("This portfolio already has 50 stocks.");
		}
	});

	$(".performance-button").on("click", function(e) {
		// get current portfolio
		let targetPortId = e.currentTarget.getAttribute("target-portfolio");
		let ports = JSON.parse(localStorage.portfolios);
		let currentPort = {};
		$.each(ports, function(i, element) {
			if (element['id'] == targetPortId)
				currentPort = element;
		});
		// update the name of graph modal
		$("#performanceTitle").text("Performance of " + currentPort["port"] + " in the last 30 days");
		let realStocks = [];
		$.each(currentPort["stocks"], function(i, s) {
			let tempStock = s["symbol"]
			if (realStocks.indexOf(tempStock) == -1){
				realStocks.push(tempStock.toUpperCase());
			}
		});
		
		// show the performance modal
		$('#performanceModal').modal();
		$("#portId").text(targetPortId);

		if (realStocks.length < 1) {
			$("#portInfo").removeAttr("hidden");
		} else {
			let graphData = ["Date"];
			graphData.push.apply(graphData, realStocks);

			let dataArray = [];
			for (let i=1; i<graphData.length; i++) {
				$.ajax({
					url: alphaVantageApiString + "function=TIME_SERIES_DAILY&symbol=" + graphData[i] + "&apikey=" + alphaVantageApiKey,
					dataType: "json",
					type: "GET",
					async: false,
					success: function(data) {
						// get data for the last 30 days
						let allValueDaily = Object.values(data)[1];
						for (let d=0; d<30; d++) {
							let row = {
								"date": new Date(Object.keys(allValueDaily)[d]),
								"symbol": graphData[i],
								"value": Object.values(allValueDaily)[d]["4. close"]
							}
							dataArray.push(row);
						}
					}
				});
			}

			dataArray.sort(sort_by("date", "symbol"));

			// change the data structure to graph data structure
			let finalData = [graphData];
			let r=0;
			while(r < dataArray.length) {
				let tempData = [];
				tempData.push(dataArray[r]["date"]);
				for (let j=0; j<realStocks.length; j++) {
					tempData.push(dataArray[r]["value"]);
					r++;
				}
				finalData.push(tempData);		
			}
			
			// store the data into local storage
			let str = JSON.stringify(finalData);
			localStorage.perfGraphData = str;
			
			google.charts.load('current', {'packages':['corechart']});
      		google.charts.setOnLoadCallback(drawChart);
		}
	});

	$(".remove-stock-button").on("click", function(e) {
		let targetPortId = e.currentTarget.getAttribute("target-portfolio");
		// get selected stocks
		let table = $("#table-" + targetPortId).DataTable();
		let selectedRows = table.rows('.selected').data();

		// get current portfolio
		let ports = JSON.parse(localStorage.portfolios);
		let currentPort = {};
		$.each(ports, function(i, element) {
			if (element['id'] == targetPortId)
				currentPort = element;
		});
		let portIndex = ports.indexOf(currentPort);

		for (let i=0; i<selectedRows.length;i++) {
			for (let j=0; j<currentPort["stocks"].length; j++) {
				if (selectedRows[i]["id"] == currentPort["stocks"][j]["id"]) {
					ports[portIndex]["stocks"].splice(j, 1)
				}
			}
		}

		// update the storage
		let str = JSON.stringify(ports);
		localStorage.setItem("portfolios", str);

		// redraw the table
		let rowsData = ports[portIndex]["stocks"];
		let newTotalValuePort = 0;
		let currencyIcon = "$";
		$.each(rowsData, function(i, element) {
			// checkbox column
			let rValue = element["value"];
			if (currentPort["currency"] == "EUR") {
				currencyIcon = "€";
				element["value"] = currencyIcon + (rValue * localStorage.currencyExchangeRate).toFixed(2);
				element["totalValue"] = currencyIcon + (rValue * element["quantity"] * localStorage.currencyExchangeRate).toFixed(2);
				newTotalValuePort += (rValue * element["quantity"] * localStorage.currencyExchangeRate);
			} else {
				newTotalValuePort += parseFloat(element["totalValue"]);
				element["value"] = currencyIcon + element["value"].toFixed(2);
				element["totalValue"] = currencyIcon + element["totalValue"].toFixed(2);
			}
		});
		// update total value of the portfolio
		$("#total-" + targetPortId).text(currencyIcon + newTotalValuePort.toFixed(2));

		table.clear();
		table.rows.add(rowsData);
		table.draw();
	});

	$("#savePortButton").on("click", function() {
		if($("#portNameText").val() == "") {
			$("#nameError").text("You must enter the name of this portfolio!");
			$("#nameError").removeAttr("hidden");
		} else {
			// maximum number of portfolios can be created is 10
			if (portCount < 10) {
				// may need to turn off 'Block third-party cookies' on browser to use localStorage
				try {
					if (typeof(Storage) !== "undefined") {
						// each portfolio has an unique id
						let newPort = {
							"id": makeId(),
							"port": $("#portNameText").val(),
							"currency": "USD",
							"stocks": []
						};
						
						// add new portfolio to the local storage
						if (localStorage.portfolios) {
							let ports = JSON.parse(localStorage.portfolios);
							ports.push(newPort);
							let str = JSON.stringify(ports);
							localStorage.setItem("portfolios", str);
						} else {
							let ports = new Array(newPort);
							let str = JSON.stringify(ports);
							localStorage.setItem("portfolios", str);
						}
						
						// refresh page
						location.reload();
					}

					// close the modal
					$('#addPortModal').modal('toggle'); 
				}
				catch(e) {
					alert("Allow this site to save and read cookies to use local storage");
				}
			}
		}
	});

	$("#saveStockButton").on("click", async function() {
		let symbol = $("#symbolText").val().trim();
		let quantity = $("#quantityText").val();
		let targetPortId = $("#stockPortId").text();

		if (symbol == "" || quantity == "") {
			$("#stockError").text("Please enter both symbol and quantity!");
			$("#stockError").removeAttr("hidden");
		}
		else {
			let latestValue = 0;
			// save the new symbol to storage
			let newUniqueStock = {
				"symbol": symbol,
				"value": 0
			}
			// pull value of a stock from local storage to avoid calling api too much
			if (localStorage.uniqueStockData) {
				let stocks = JSON.parse(localStorage.uniqueStockData);
				let isExist = false;
				let stock = {};
				$.each(stocks, function(i, s) {
					if (s["symbol"] == symbol){
						isExist = true;
						stock = s;
					}
				});
				// get new value of a stock if it is refreshRate(5) minutes old to slightly increase performance
				if (isExist) {
					let utcNow = getUtcNow();
					let lastRefreshDateTime = new Date(localStorage.lastRefreshStock);
					let diffInSeconds = (utcNow.getTime() - lastRefreshDateTime.getTime()) / 1000;
					if (diffInSeconds <= refreshRate) {
						latestValue = stock["value"];
					} else {
						latestValue = await getStockValueFromApi(symbol);
						newUniqueStock["value"] = latestValue;
						stocks.push(newUniqueStock);
						let str = JSON.stringify(stocks);
						localStorage.setItem("uniqueStockData", str);

						localStorage.lastRefreshStock = getUtcNow();
					}
				} else {
					latestValue = await getStockValueFromApi(symbol);
					newUniqueStock["value"] = latestValue;
					stocks.push(newUniqueStock);
					let str = JSON.stringify(stocks);
					localStorage.setItem("uniqueStockData", str);

					localStorage.lastRefreshStock = getUtcNow();
				}
			} else {
				latestValue = await getStockValueFromApi(symbol);
				newUniqueStock["value"] = latestValue;
				let stocks = new Array(newUniqueStock);
				let str = JSON.stringify(stocks);
				localStorage.setItem("uniqueStockData", str);

				localStorage.lastRefreshStock = getUtcNow();
			}

			if (latestValue == 0) {
				$("#stockError").text("There is no stock has that symbol!");
				$("#stockError").removeAttr("hidden");
			} else {
				// create new stock
				let newStock = {
					"id": makeId(),
					"symbol": symbol,
					"value": latestValue,
					"quantity": quantity,
					"totalValue": latestValue * quantity,
					"select": "<input class='select-checkbox' type='checkbox' >"
				};
				// get the current portfolio
				let ports = JSON.parse(localStorage.portfolios);
				let currentPort = {};
				$.each(ports, function(i, element) {
					if (element['id'] == targetPortId)
					currentPort = element;
				});
				let index = ports.indexOf(currentPort);
				// add new stock to the current portfolio
				ports[index]["stocks"].push(newStock);
				let str = JSON.stringify(ports);
				localStorage.setItem("portfolios", str);
				
				// update table
				let table = $("#table-" + targetPortId).DataTable();
				let rowsData = ports[index]["stocks"];
				let newTotalValuePort = 0;
				let currencyIcon = "$";
				$.each(rowsData, function(i, element) {
					// checkbox column
					let rValue = element["value"];
					if (currentPort["currency"] == "EUR") {
						currencyIcon = "€";
						element["value"] = currencyIcon + (rValue * localStorage.currencyExchangeRate).toFixed(2);
						element["totalValue"] = currencyIcon + (rValue * element["quantity"] * localStorage.currencyExchangeRate).toFixed(2);
						newTotalValuePort += (rValue * element["quantity"] * localStorage.currencyExchangeRate);
					} else {
						newTotalValuePort += parseFloat(element["totalValue"]);
						element["value"] = currencyIcon + element["value"].toFixed(2);
						element["totalValue"] = currencyIcon + element["totalValue"].toFixed(2);
					}
				});
				// update total value of the portfolio
				$("#total-" + targetPortId).text(currencyIcon + newTotalValuePort.toFixed(2));

				table.clear();
				table.rows.add(rowsData);
				table.draw();

				// close the modal
				$('#addStockModal').modal('toggle'); 	
			}
		}
	});

	$(".select-currency").on("change", function (e) {
		// get the id of that portfolio
		let portId = e.currentTarget.getAttribute("target-portfolio");
		let selectedCurrency = $(e.currentTarget).val();
		
		let ports = JSON.parse(localStorage.portfolios);
		let currentPort = {};
		$.each(ports, function(i, element) {
			if (element['id'] == portId)
				currentPort = element;
		});
		// change currency of the current portfolio
		let index = ports.indexOf(currentPort);
		if (selectedCurrency !== "" && ports[index]["currency"] !== selectedCurrency) {
			ports[index]["currency"] = selectedCurrency;
			let str = JSON.stringify(ports);
			localStorage.setItem("portfolios", str);

			// update table
			let table = $("#table-" + portId).DataTable();
			let rowsData = table.rows().data();
			let newTotalValuePort = 0;
			let currencyIcon = "$";
			$.each(rowsData, function(i, element) {
				let rValue = parseFloat(element["value"].toString().substring(1));
				if (selectedCurrency == "EUR") {
					currencyIcon = "€";
					element["value"] = currencyIcon + (rValue * localStorage.currencyExchangeRate).toFixed(2);
					element["totalValue"] = currencyIcon + (rValue * element["quantity"] * localStorage.currencyExchangeRate).toFixed(2);
					newTotalValuePort += (rValue * element["quantity"] * localStorage.currencyExchangeRate);
				} else {
					element["value"] = currencyIcon + (rValue / localStorage.currencyExchangeRate).toFixed(2);
					element["totalValue"] = currencyIcon + ((rValue * element["quantity"]) / localStorage.currencyExchangeRate).toFixed(2);
					newTotalValuePort += ((rValue * element["quantity"]) / localStorage.currencyExchangeRate);
				}
			});
			// update total value of the portfolio
			$("#total-" + portId).text(currencyIcon + newTotalValuePort.toFixed(2));

			table.clear();
			table.rows.add(rowsData);
			table.draw();
		}
	});

	$('#addPortModal').on('hide.bs.modal', function () {
		// refresh field when close modal
		$("#portNameText").val("");
		$("#nameError").attr("hidden", "true");
	})

	$('#addPortModal').on('shown.bs.modal', function () {
		// focus on Name textbox when open modal
		$("#portNameText").focus();
	})

	$('#addStockModal').on('shown.bs.modal', function () {
		// focus on Symbol textbox when open modal
		$("#symbolText").focus();
	})

	$('#addStockModal').on('hide.bs.modal', function () {
		// refresh fields when close modal
		$("#symbolText").val("");
		$("#quantityText").val("");
		$("#stockError").attr("hidden", "true");
		$("#stockPortId").text("");
	})

	$('#performanceModal').on('hide.bs.modal', function() {
		$("#portInfo").attr("hidden", "true");
	});
});

function makeId() {
	let text = "";
	let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  
	for (let i = 0; i < 5; i++)
	  	text += possible.charAt(Math.floor(Math.random() * possible.length));
  
	return text;
}

function getStockValueFromApi(symbol) {
	let result = 0;
	$.ajax({
		url: alphaVantageApiString + "function=TIME_SERIES_INTRADAY&symbol=" + symbol + "&interval=5min&apikey=" + alphaVantageApiKey,
		dataType: "json",
		async: false,
		type: "GET",
		success: function(data) {
			if (data["Error Message"]) {
				$("#stockError").text("There is an error while adding stock!");
				$("#stockError").removeAttr("hidden");
			} else {
				let allValue = Object.values(data)[1];
				result = parseFloat(Object.values(allValue)[0]["4. close"]);
			}
		},
	});
	return result;
}

function getCurrencyExchangeRate() {
	if (localStorage.currencyExchangeRate) {
		let utcNow = getUtcNow();
		let lastRefreshDateTime = new Date(localStorage.lastRefresh);
		let diffInSeconds = (utcNow.getTime() - lastRefreshDateTime.getTime()) / 1000;
		// refresh the currency rate if it is refreshRate(5) minutes old to slightly improve performance
		if (diffInSeconds > refreshRate) {
			$.ajax({
				url: alphaVantageApiString + "function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=EUR&apikey=" + alphaVantageApiKey,
				dataType: "json",
				type: "GET",
				success: function(data) {
					if(data["Realtime Currency Exchange Rate"]){
						localStorage.currencyExchangeRate = Object.values(data)[0]["5. Exchange Rate"];
						localStorage.lastRefresh = Object.values(data)[0]["6. Last Refreshed"];
					}
				}
			});
		}
	} else {
		$.ajax({
			url: alphaVantageApiString + "function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=EUR&apikey=" + alphaVantageApiKey,
			dataType: "json",
			type: "GET",
			success: function(data) {
				if(data["Realtime Currency Exchange Rate"]){
					localStorage.currencyExchangeRate = Object.values(data)[0]["5. Exchange Rate"];
					localStorage.lastRefresh = Object.values(data)[0]["6. Last Refreshed"];
				}
			}
		});
	}
}

function populatePortfoliosHTML() {
	if (typeof(Storage) !== "undefined") {
		if (localStorage.portfolios) {
			let ports = JSON.parse(localStorage.portfolios);
			portCount = ports.length;
			// remove current list of portfolios
			$("#containerDiv > div").remove();

			// populate portfolios
			$.each(ports, function(i, element) {
				// get currency of this portfolio
				let currencyIcon = "$";
				let rate = 1;
				if (element["currency"] === "EUR") {
					rate = localStorage.currencyExchangeRate;
					currencyIcon = "€";
				}

				// currency select options html
				let currencyOptionsString = ""
				if (element["currency"] === "EUR") {
					currencyOptionsString = '<option value="USD">USD</option><option value="EUR" selected>EUR</option>';
				} else {
					currencyOptionsString = '<option value="USD" selected>USD</option><option value="EUR">EUR</option>';
				}

				$("#containerDiv").append('<div class="row"> \
					<div class="content-wrapper"> \
						<div class="delete-div"> \
							<button class="btn delete-button" target-portfolio="' + element['id'] + '"></button> \
						</div> \
						<div class="content-header"> \
							<div> \
									<h3 style="text-transform: capitalize">' + element['port'] + '</h3> \
							</div> \
							<select class="custom-select select-currency" target-portfolio="' + element['id'] + '">' + currencyOptionsString + '</select> \
						</div> \
						<div class="content-main"> \
							<table class="table table-striped stockTable" id="table-' + element['id'] + '" cellspacing="0" width="100%"> \
								<thead> \
									<tr> \
										<th>Select</th> \
										<th>Name</th> \
										<th>Unit Value</th> \
										<th>Quantity</th> \
										<th>Total Value</th> \
									</tr> \
								</thead> \
								<tbody></tbody> \
							</table> \
						</div> \
						<div class="content-info"> \
							Total value of ' + element['port'] + ': <span id="total-' + element['id'] + '"></span> \
						</div> \
						<div class="content-footer"> \
							<div class="block"> \
								<button class="btn btn-light add-stock-button" target-portfolio="' + element['id'] + '">Add stock</button> \
							</div> \
							<div class="block"> \
								<button class="btn btn-light performance-button" target-portfolio="' + element['id'] + '">Performance graph</button> \
							</div> \
							<div class="block"> \
								<button class="btn btn-light remove-stock-button" target-portfolio="' + element['id'] + '" disabled>Remove selected</button> \
							</div> \
						</div> \
					</div> \
				</div>'); 

				// populate datatable
				let rowsData = element["stocks"];
				let newTotalValuePort = 0;
				$.each(rowsData, function(i, r) {
					// checkbox column
					let rValue = r["value"];
					if (element["currency"] == "EUR") {
						currencyIcon = "€";
						r["value"] = currencyIcon + (rValue * localStorage.currencyExchangeRate).toFixed(2);
						r["totalValue"] = currencyIcon + (rValue * r["quantity"] * localStorage.currencyExchangeRate).toFixed(2);
						newTotalValuePort += (rValue * element["quantity"] * localStorage.currencyExchangeRate);
					} else {
						newTotalValuePort += parseFloat(r["totalValue"]);
						r["value"] = currencyIcon + r["value"].toFixed(2);
						r["totalValue"] = currencyIcon + r["totalValue"].toFixed(2);
					}
				});
				// update total value of the portfolio
				$("#total-" + element['id']).text(currencyIcon + newTotalValuePort.toFixed(2));

				let table = $("#table-" + element['id']).DataTable({
					"scrollY": "220px",
					"scrollCollapse": true,
					"paging": false,
					"searching": false,
					"info": false,
					"data": rowsData,
					"rowId": "id",
					columns: [
						{ 'data': 'select'},
						{ 'data': 'symbol' },
						{ 'data': 'value' },
						{ 'data': 'quantity' },
						{ 'data': 'totalValue'},
					]
				});
			});
		}
	}
}

function drawChart() {
	let graphData = JSON.parse(localStorage.perfGraphData);
	for (let i=1; i<graphData.length; i++) {
		graphData[i][0] = new Date(graphData[i][0]);
		let stockNumber = graphData[i].length;
		for (let j=1; j<stockNumber; j++) {
			graphData[i][j] = parseFloat(graphData[i][j]);
		}
	}

	var data = google.visualization.arrayToDataTable(graphData);

	var options = {
		title: 'Stocks Performance',
		width: 750,
		height: 500,
		curveType: 'function',
		animation:{
			"startup": true,
			duration: 500,
			easing: 'out',
		  },
		legend: { position: 'top' },
		hAxis: {
            format: 'M/d/yyyy',
            gridlines: {count: 15}
		  },
		vAxis: {
			format: 'decimal',
			gridlines: {count: 10}
		}
	};

	var chart = new google.visualization.LineChart(document.getElementById('performanceChart'));

	chart.draw(data, options);
}

function getUtcNow() {
	let now = new Date();
	let utcNow = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
	return utcNow;
}

function refreshData(refreshRate) {
	let utcNow = getUtcNow();
	let lastRefreshDateTime = new Date(localStorage.lastRefreshStock);
	let diffInSeconds = (utcNow.getTime() - lastRefreshDateTime.getTime()) / 1000;
	if (diffInSeconds > refreshRate) {
		localStorage.lastRefreshStock = utcNow;
		if (localStorage.portfolios) {
			let ports = JSON.parse(localStorage.portfolios);

			for (let p=0; p<ports.length; p++) {
				for (let s=0; s<ports[p]["stocks"].length; s++) {
					let symbol = ports[p]["stocks"][s]["symbol"];
					ports[p]["stocks"][s]["value"] = getStockValueFromApi(symbol);
				}
			}
			let str = JSON.stringify(ports);
			localStorage.setItem("portfolios", str);
		}
	}
}

var sort_by = function() {
    var fields = [].slice.call(arguments),
        n_fields = fields.length;

    return function(A, B) {
        var a, b, field, key, primer, reverse, result;
        for (var i = 0, l = n_fields; i < l; i++) {
            result = 0;
            field = fields[i];

            key = typeof field === 'string' ? field : field.name;

            a = A[key];
            b = B[key];

            if (typeof field.primer !== 'undefined') {
                a = field.primer(a);
                b = field.primer(b);
            }

            reverse = (field.reverse) ? -1 : 1;

            if (a < b) result = reverse * -1;
            if (a > b) result = reverse * 1;
            if (result !== 0) break;
        }
        return result;
    }
}