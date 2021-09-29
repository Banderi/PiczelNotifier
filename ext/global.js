if (chrome) {
	storage = chrome.storage;
	tabs = chrome.tabs;
	notifications = chrome.notifications;
	browser = chrome;
}
if (!browser.cookies) {
	browser.cookies = browser.experimental.cookies;
}
function isDevMode() {
    return !('update_url' in browser.runtime.getManifest());
}

function log_message(t) {
	if (isDevMode())
		console.log(t);
}

var motd = "First version!";

var livecount = 0;
var invitecount = 0;
var ownname = "";
var exploreData = {};
var alreadyStreaming = [];
var notifications = 0;

var notloggedinrecall = false;

var auth = {};

/* var picartoClientID = "Pb5mFzEq7MMetQ8p" */
/* var redirectURI = "https://banderi.github.io/PicartoNotifier/redirect.html" */
/* var crxID = "fifjhakdmflgahkghkijipchfomdajfn" */
/* var picartoURL = "https://oauth.picarto.tv/authorize?redirect_uri=" + redirectURI + "&response_type=token&scope=readpub readpriv write&state=OAuth2Implicit&client_id=" + picartoClientID */
/* var tokenRegex = RegExp("[&#]access_token=(.+?)(?:&|$)") */

var apiurl = 'https://piczel.tv/api/'
var offurl = 'https://piczel.tv/static'
var piczelurl = "http://piczel.tv/watch/"

function IsNullOrWhitespace( input ) {
  return !input || !input.trim();
}

async function getCookies(domains, name, callback, failure) {
	for (d in domains) {
		// FORCE function to wait...
		const value = await new Promise((resolve, reject) => {
			browser.cookies.get({"url": domains[d], "name": name}, function(cookie) {
				if (cookie) {
					// console.log(cookie);
					resolve(cookie.value);
				} else reject();
			});
		}).catch(e => {
			if (e)
				console.log(e); // unexpected error???? otherwise, it's from "reject"
		});
		if (value && callback)
			return callback(value, domains[d]);
	}
	if (failure)
		return failure(); // none of the domains matched....
}
/* function setCookie(url, name, value, callback) {
	browser.cookies.set({"url": url, "name": name, "value": value}, function() {
		if (callback)
			callback();
	});
} */

/* function OAuthConnect(interactive = false, callback) {
	console.log("Parsing oauth...");
	console.log("Redirect URI: " + redirectURI);
	browser.identity.launchWebAuthFlow({'url': picartoURL,'interactive': interactive}, (redirect_url) => {
		let parsed = tokenRegex.exec(redirect_url);
		console.log("Redirect received! Parsing...");
		if (parsed) {
			console.log("Logged in!");
			token = parsed[1];
			storage.local.set({"OAUTH" : token});
			
			typeof callback === 'function' && callback();
		} else {
			token = "";
			console.group("OAuth2 Failed:");
			console.log(redirect_url);
			console.log(parsed);
			console.groupEnd();
			typeof callback === 'function' && callback();
		}
	});
} */
async function getAPI(url, callback) {
	try {
		await $.ajax({
			url: apiurl + url,
			method: "GET",
			dataType: "json",
			crossDomain: true,
			contentType: "application/json; charset=utf-8",
			cache: false,
			beforeSend: function (xhr) {
				xhr.setRequestHeader("Authorization", "Bearer " + token);
			},
			success: function (data) {
				typeof callback === 'function' && callback(data);
			},
			error: function (jqXHR, textStatus, errorThrown) {
				console.log(jqXHR.responseText);
			}
		});
	} catch (e) {
		//
	}
}
async function postAPI(url, callback) {
	await $.ajax({
		url: apiurl + url,
		method: "POST",
		crossDomain: true,
		contentType: "application/json; charset=utf-8",
		cache: false,
		/* beforeSend: function (xhr) {
			xhr.setRequestHeader("Authorization", "Bearer " + token);
		}, */
		success: function (data) {
			typeof callback === 'function' && callback(data);
		},
		error: function (jqXHR, textStatus, errorThrown) {
			console.log(textStatus);
			console.log(errorThrown);
		}
	});
}

function notify(name, type, avatarurl) {
	
	if (type == "live") {
		if (settings.notifications) {
			let timestamp = new Date().getTime();
			let id = 'myid' + timestamp;
			browser.notifications.create(id, {
				type: "basic",
				iconUrl: avatarurl,
				title: "Currently streaming on Piczel:",
				message: name
			}, function() {});
			if (settings.alert)
				ding.play();
		}
	}
}

function updateLive(callback) {
	
	livecount = 0;
	let cleanData = {};
	
	// get the cached list of live users and update accordingly!
	storage.local.get("LIVE", function(items) {
		
		let livecache = items["LIVE"];
		for (u in livecache) { // loop through cached users to update for removal
			
			let stream = livecache[u]; // the actual stored object
			let name = u; // saved with key rather than index
			
			let live = false;
			
			// compare with newly pulled data
			for (i in exploreData) {
				
				// got a match! cache will be updated and name will be remembered
				if (exploreData[i].user.username && name === exploreData[i].user.username) {
					
					/* exploreData[i]["old"] = true; */
					live = true;
				}
			}
			
			// user no longer online
			if (!live) {
				
				// remove user from cache
				delete livecache[u]
				log_message("User '" + name + "' no longer online (removed from cache)");
			}
		}
		
		// add the remaining users and dispatch notifications
		for (s in exploreData) {
			
			let stream = exploreData[s];
			
			let name = stream.username;
			let avatarurl = stream.user.avatar.url;
			
			cleanData[name] = stream;
			
			// new user online
			if (!livecache || !(name in livecache)) {
				log_message(name + " just started streaming!");
				
				// dispatch live notification (or not)
				notify(name, "live", avatarurl);
			}
		}
		
		livecount = Object.keys(cleanData).length;
		
		browser.storage.local.set({"LIVE" : cleanData}, function() {
			typeof callback === 'function' && callback();
		});
	});
}
function updateAPI(callback) {
	
	storage.local.get(["OAUTH"], (data) => {
		if (data["OAUTH"]) {
			token = data["OAUTH"];
			if (token.indexOf(' ') != -1) {
				token = token.substr(token.indexOf(' ') + 1);
				storage.local.set({"OAUTH" : token});
			}
			if (IsNullOrWhitespace(token)) {
				token = "";
				storage.local.remove("OAUTH");
			}
		}
		if (token) {
			storage.local.get(["CACHESTAMP"], (data) => {
				if (data["CACHESTAMP"] && Date.now() < data["CACHESTAMP"] + 15000) {
					//
				} else {
					getAPI("user", function(a) {
						storage.local.set({"API_USER" : a});
						storage.local.set({"USERNAME" : a["channel_details"]["name"]});
					});
					getAPI("user/notifications", function(c) {
						if (c)
							notifications = c.length;
						else
							notifications = 0;
						
						storage.local.set({"API_NOTIFICATIONS" : c});
						
						// automatically remove notifications if setting is enabled
						if (settings.picartobar && c && c[0]) {
							for (n in c) {
								postAPI("user/notifications/" + c[n]["uuid"] + "/delete");
							}
							c = {};
							storage.local.set({"API_NOTIFICATIONS" : c});
							notifications = 0;
						}
						
					});
				}
			});
			getAPI("user/multistream", function(b) {
				if (b["incoming"])
					invitecount = b["incoming"].length;
				else
					invitecount = 0;
				storage.local.set({"API_MULTISTREAM" : b});
			});
		}
		updateBadge();
	});
	typeof callback === 'function' && callback();
}
function updateBadge(callback) {
	browser.browserAction.setBadgeBackgroundColor( { color: settings.badgecolor} );
			
	var badgetext = "";
	var badgetooltip = "";
	
	if(settings.badgenotif) {
		if (notifications == 1) {
			badgetext = "1";
			badgetooltip = "1 person streaming";
		} else if (notifications > 1) {
			badgetext = notifications.toString();
			badgetooltip = notifications.toString() + " notifications";
		} else {
			var badgetext = "";
			var badgetooltip = "";
		}
		browser.browserAction.setBadgeText({"text": badgetext});
		browser.browserAction.setTitle({"title": badgetooltip});
	}
	else {
		if (settings.streamer) {
			
			if (livecount == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (livecount > 1) {
				badgetext = livecount.toString();
				badgetooltip = livecount.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			if (livecount > 0) {
				if (invitecount == 1) {
					badgetext = badgetext + ", 1";
					badgetooltip = badgetooltip + ", 1 invite";
				} else if (invitecount > 1) {
					badgetext = badgetext + ", " + invitecount.toString();
					badgetooltip = badgetooltip + ", " + invitecount.toString() + " invites";
				}
			}
			else {
				if (invitecount == 1) {
					badgetext = "1";
					badgetooltip = "1 invite";
				} else if (invitecount > 1) {
					badgetext = invitecount.toString();
					badgetooltip = invitecount.toString() + " invites";
				}
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
		else {		
			if (livecount == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (livecount > 1) {
				badgetext = livecount.toString();
				badgetooltip = livecount.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
	}
	
	
	
	typeof callback === 'function' && callback();
}
function updateMOTD() {
	let version = browser.runtime.getManifest().version;	
	if (settings.updatemsg) {
		storage.sync.get(["MOTD"], (data) => {
			if ((data["MOTD"] && data["MOTD"] != "" && data["MOTD"].split('.').slice(0,2).join(".") != version.split('.').slice(0,2).join(".")) || !data["MOTD"] || data["MOTD"] == "") {
				browser.notifications.create("MOTD", {
					type: "basic",
					iconUrl: "icons/icon256.png",
					title: "Piczel Notifier updated to " + version.toString().substr(0, 3) + "!",
					message: motd
				}, function() {});
			}
			storage.sync.set({"MOTD" : version});
		});
	}
	else
		storage.sync.set({"MOTD" : version});
}

function update_from_cookies() {
	// fetch auth data from cookies, use that to get live streams info
	getCookies(["https://piczel.tv", "http://piczel.tv", "https://www.piczel.tv", "http://www.piczel.tv"], "authHeaders",
		function(a) {
			let b = decodeURIComponent(a);
			let c = JSON.parse(b);
			/* log_message(a);
			log_message(b);
			log_message(c); */
			
			storage.sync.set({"OAUTH" : c}, function() {
				auth = c;
				fetch_live_users();
			});
		},
		function() {
			log_message("Not found.... :(");
		}
	);
}
function fetch_live_users() {
	
	let auth_bear = auth["access-token"];
	let client = auth["client"];
	let uid = auth["uid"];
	
	/* let querytosend = {
		query: "query ($first: Int!, $page: Int!, $q: String) {\n  following(first: $first, page: $page, q: $q, orderBy: {field: \"last_live\", order: DESC}) {\n    account_type\n    avatar\n    channel_name\n    id\n    last_live\n    online\n    __typename\n  }\n}\n",
		variables: {
			"first": settings.maxnames,
			"page": 1,
			"q": ""
		}
	} */
	
	$.ajax({
		url: 'https://piczel.tv/api/streams?followedStreams=true&live_only=true&sfw=false',
		method: "GET",
		dataType: "json",
		crossDomain: true,
		contentType: "application/json; charset=utf-8",
		cache: false,
		beforeSend: function (xhr) {
			xhr.setRequestHeader('access-token', auth_bear);
			xhr.setRequestHeader('Client', client);
			xhr.setRequestHeader('uid', uid);
		},
		success: function(data) {
			
			exploreData = [];
			
			for (s in data) {
				let stream = data[s];
				if (!stream.live || !stream.following.value)
					continue;
				else
					exploreData.push(stream);
			}
			
			/* log_message('Scraping "Connections" page...'); */
			/* log_message($(data).find('.ant-avatar-image')); */
			/* log_message(exploreData); */
			
			updateLive(()=>{
				/* updateAPI(()=>{ */
					updateBadge(()=>{
						updateMOTD(); // done!
					})
				/* }) */
			})
		},
		error: function(data) {
			log_message(data); // oh no
		}
	});
}

// get default settings or fetch from storage
let defaults = {};
var settings = {};
function initSettings(callback) {
	const url = browser.runtime.getURL('defaults.json');
	fetch(url)
		.then(e => e.json())
		.then(j =>
	{
		defaults = j;
		settings = {
			...defaults
		};
		callback();
	});
}

var updater = null;

// main update function
function update() {
	storage.local.set({"ERROR" : 0});
	
	if (auth != {}) { // no auth structure in cache (global var)
		storage.sync.get("OAUTH", (data) => {
			if (data["OAUTH"]) { // get from local storage
				auth = data["OAUTH"];
				fetch_live_users();
			} else {
				log_message("No saved auth data found!! Fetching from cookies...");
				update_from_cookies();
			}
		});
	} else {
		fetch_live_users();
	}
	
	updater = setTimeout(update, settings.updateinterval * 1000);
}

function startup() {
	storage.sync.get(["SETTINGS"], (data) => {
		for (let a in data["SETTINGS"]) {
			let setting = data["SETTINGS"][a];
			settings[a] = setting;
		}
		
		// set notif volume
		ding.volume = parseFloat(settings.dingvolume) / 100;
		
		// start the update!
		if (!updater)
			update();
	});
}

function restart() {
	initSettings(startup);
}
restart();

// create audio alert object
var ding = new Audio('audio/ding.ogg');

// add listener to the desktop notification popups
browser.notifications.onClicked.addListener(function(notificationId) {
	if (notificationId !== "MOTD") {
		if (isDevMode()) {
			console.log("Notification clicked! ID: " + notificationId);
		}
		window.open('https://picarto.tv/' + notificationId, '_blank');
		browser.notifications.clear(notificationId, function() {});
	}
});

// listen for messages from other pages
browser.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
		switch (request.message) {
		case "setCount":
			setCount(request.count);
			break
		case "settingChanged":
			if (isDevMode()) {
				console.log("Settings updated!");
			}
			for (s in request) {
				if (s != "message") {
					settings[s] = request[s];
				}
			}
			restart();
			break
		case "updateAll":
			restart();
			break
		case "purgeAll":
			settings = {};
			livecount = 0;
			invitecount = 0;
			ownname = "";
			exploreData = {};
			notloggedinrecall = false;
			token = "";
			restart();
			break;
		case "notificationRemoved":
			notifications -= 1;
			updateBadge();
			break;
		case "oauth":
			OAuthConnect(true, function() {
				browser.browserAction.getBadgeText({}, function(result) {
					sendResponse("OK");
				});
			});
			return true;
		case "getBadgeText":
			if (isDevMode()) {
				console.log("getBadgeText");
			}
			browser.browserAction.getBadgeText({}, function(result) {
				sendResponse(result);
			});
			return true;
		case "tabID":
			sendResponse({tab: sender.tab.id});
			break;
		}
		return false;
	}
);