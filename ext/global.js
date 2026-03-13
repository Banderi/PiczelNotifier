if (chrome) {
	storage = chrome.storage;
	tabs = chrome.tabs;
	NOTIFICATIONS = chrome.notifications;
	browser = chrome;
}
if (!browser.cookies) {
	browser.cookies = browser.experimental.cookies;
}
function isDevMode() {
    return !('update_url' in browser.runtime.getManifest());
}
function IsNullOrWhitespace(input) {
  return !input || !input.trim();
}

function log_message(t) {
	if (isDevMode())
		console.log(t);
}
var MOTD = "Fixed the API calls after Feb. 2026, code refactors.";

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

var API_URL = 'https://piczel.tv/api/'
var STATIC_URL = 'https://piczel.tv/static'
var WATCH_URL = "http://piczel.tv/watch/"
var AUTH = {};
var API_TOKEN = ""; // currently unused
async function ajax(url, callback, failure, method, dataType, contentType) {
	let auth_bear = AUTH["access-token"];
	let client = AUTH["client"];
	let uid = AUTH["uid"];
	try {
		await $.ajax({
			url: url,
			method: "GET",
			dataType: dataType,
			crossDomain: true,
			contentType: contentType,
			cache: false,
			beforeSend: function (xhr) {
				xhr.setRequestHeader('access-token', auth_bear);
				xhr.setRequestHeader('Client', client);
				xhr.setRequestHeader('uid', uid);
			},
			success: function (r, status, xhr) {
				typeof callback === 'function' && callback(r, status, xhr);
			},
			error: function (jqXHR, textStatus, errorThrown) {
				if (!failure) {
					console.log(errorThrown);
					console.log(textStatus);
					console.log(jqXHR.responseText);
				}
				typeof failure === 'function' && failure(jqXHR.responseJSON, textStatus, errorThrown);
			}
		});
	} catch (e) {
		//
	}
}
async function getAPI(url, callback, failure = null) {
	let auth_bear = AUTH["access-token"];
	let client = AUTH["client"];
	let uid = AUTH["uid"];
	await ajax(API_URL + url, callback, failure, "GET", "json", "application/json; charset=utf-8");
}
async function postAPI(url, callback) {
	await $.ajax({
		url: API_URL + url,
		method: "POST",
		crossDomain: true,
		contentType: "application/json; charset=utf-8",
		cache: false,
		/* beforeSend: function (xhr) {
			xhr.setRequestHeader("Authorization", "Bearer " + token);
		}, */
		success: function (r) {
			typeof callback === 'function' && callback(r);
		},
		error: function (jqXHR, textStatus, errorThrown) {
			console.log(textStatus);
			console.log(errorThrown);
		}
	});
}

var DING = new Audio('audio/ding.ogg');
function notify(name, type, avatarurl) {
	
	if (type == "live") {
		if (SETTINGS.notifications) {
			let timestamp = new Date().getTime();
			let id = name + '__@@' + timestamp;
			browser.notifications.create(id, {
				type: "basic",
				iconUrl: avatarurl,
				title: "Currently streaming on Piczel:",
				message: name
			}, function() {});
			if (SETTINGS.alert)
				DING.play();
		}
	}
}

// Piczel data
var OWNNAME = "";
var GLOBAL_LIVE_STREAMS = {};
var FOLLOW_LIST = [];
var LIVE_COUNT = 0;
var INVITES_COUNT = 0;
var NOTIFICATIONS = 0;
var NEXT_ERROR = 0;

function updateLive(callback) {
	
	LIVE_COUNT = 0;
	
	// get the cached list of live users and update accordingly!
	storage.local.get("LIVE", function(items) {
		
		let livecache = items["LIVE"];
		if (typeof livecache !== typeof {})
			livecache = {};

		// loop through cached users to update for removal
		for (username in livecache) {
			if (!(username in GLOBAL_LIVE_STREAMS)) {
				delete livecache[username];
				log_message("User '" + username + "' no longer online (removed from cache)");
			}
		}
		
		// add the remaining users and dispatch notifications
		let cleanData = {};
		for (i in FOLLOW_LIST) {
			let username = FOLLOW_LIST[i];
			if (username in GLOBAL_LIVE_STREAMS) {
				let formatted = GLOBAL_LIVE_STREAMS[username];
				if (!(username in livecache)) {
					log_message(username + " just started streaming!");
					notify(username, "live", formatted.avatarurl); // dispatch live notification (or not)
				}
				cleanData[username] = formatted;
			}
		}

		// update live count
		LIVE_COUNT = Object.keys(cleanData).length;
		if (LIVE_COUNT == 0)
			log_message("No users streaming.");
		
		browser.storage.local.set({"LIVE" : cleanData}, function() { // synchronous, but returns promise on success
			typeof callback === 'function' && callback();
		});
	});
}
function updateAPI(callback) { // currently unused
	
	storage.local.get(["OAUTH"], (r) => {
		if (r["OAUTH"]) {
			API_TOKEN = r["OAUTH"];
			if (API_TOKEN.indexOf(' ') != -1) {
				API_TOKEN = API_TOKEN.substr(API_TOKEN.indexOf(' ') + 1);
				storage.local.set({"OAUTH" : API_TOKEN});
			}
			if (IsNullOrWhitespace(API_TOKEN)) {
				API_TOKEN = "";
				storage.local.remove("OAUTH");
			}
		}
		if (API_TOKEN) {
			storage.local.get(["CACHESTAMP"], (s) => {
				if (s["CACHESTAMP"] && Date.now() < s["CACHESTAMP"] + 15000) {
					//
				} else {
					getAPI("user", function(a) {
						storage.local.set({"API_USER" : a});
						storage.local.set({"USERNAME" : a["channel_details"]["name"]});
					});
					getAPI("user/notifications", function(c) {
						if (c)
							NOTIFICATIONS = c.length;
						else
							NOTIFICATIONS = 0;
						
						storage.local.set({"API_NOTIFICATIONS" : c});
						
						// automatically remove notifications if setting is enabled
						/* if (settings.picartobar && c && c[0]) {
							for (n in c) {
								postAPI("user/notifications/" + c[n]["uuid"] + "/delete");
							}
							c = {};
							storage.local.set({"API_NOTIFICATIONS" : c});
							notifications = 0;
						} */
						
					});
				}
			});
			getAPI("user/multistream", function(b) {
				if (b["incoming"])
					INVITES_COUNT = b["incoming"].length;
				else
					INVITES_COUNT = 0;
				storage.local.set({"API_MULTISTREAM" : b});
			});
		}
		updateBadge();
	});
	typeof callback === 'function' && callback();
}
function updateBadge(callback) {
	browser.browserAction.setBadgeBackgroundColor( { color: SETTINGS.badgecolor} );
			
	var badgetext = "";
	var badgetooltip = "";
	
	if(SETTINGS.badgenotif) {
		if (NOTIFICATIONS == 1) {
			badgetext = "1";
			badgetooltip = "1 person streaming";
		} else if (NOTIFICATIONS > 1) {
			badgetext = NOTIFICATIONS.toString();
			badgetooltip = NOTIFICATIONS.toString() + " notifications";
		} else {
			var badgetext = "";
			var badgetooltip = "";
		}
		browser.browserAction.setBadgeText({"text": badgetext});
		browser.browserAction.setTitle({"title": badgetooltip});
	}
	else {
		if (SETTINGS.streamer) {
			
			if (LIVE_COUNT == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (LIVE_COUNT > 1) {
				badgetext = LIVE_COUNT.toString();
				badgetooltip = LIVE_COUNT.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			if (LIVE_COUNT > 0) {
				if (INVITES_COUNT == 1) {
					badgetext = badgetext + ", 1";
					badgetooltip = badgetooltip + ", 1 invite";
				} else if (INVITES_COUNT > 1) {
					badgetext = badgetext + ", " + INVITES_COUNT.toString();
					badgetooltip = badgetooltip + ", " + INVITES_COUNT.toString() + " invites";
				}
			}
			else {
				if (INVITES_COUNT == 1) {
					badgetext = "1";
					badgetooltip = "1 invite";
				} else if (INVITES_COUNT > 1) {
					badgetext = INVITES_COUNT.toString();
					badgetooltip = INVITES_COUNT.toString() + " invites";
				}
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
		else {		
			if (LIVE_COUNT == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (LIVE_COUNT > 1) {
				badgetext = LIVE_COUNT.toString();
				badgetooltip = LIVE_COUNT.toString() + " people streaming";
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
	if (SETTINGS.updatemsg) {
		storage.sync.get(["MOTD"], (r) => {
			if ((r["MOTD"] && r["MOTD"] != "" && r["MOTD"].split('.').slice(0,2).join(".") != version.split('.').slice(0,2).join(".")) || !r["MOTD"] || r["MOTD"] == "") {
				browser.notifications.create("MOTD", {
					type: "basic",
					iconUrl: "icons/icon256.png",
					title: "Piczel Notifier updated to " + version.toString().substr(0, 3) + "!",
					message: MOTD
				}, function() {});
			}
			storage.sync.set({"MOTD" : version});
		});
	}
	else
		storage.sync.set({"MOTD" : version});
}

// these are the actual functions translating the raw exploreData fields into formatted data
function getFormattedStreamData(raw_data) {
	let formatted_data = {};
	for (i in raw_data) {
		let raw = raw_data[i];
		formatted_data[raw.username] = {
			"live": raw.live,
			"live_since" : raw.live_since,
			"adult" : raw.adult,
			"viewers" : raw.viewers,
			"avatarurl": raw.user.avatar.url
		};
	}
	return formatted_data;
}
function getSimpleFollowedList(raw_data) {
	let list = [];
	for (i in raw_data)
		list.push(raw_data[i].stream_username);
	return list;
}

async function fetch_streams(callback) {
	getAPI('users/me/following', async (r)=> { // followed streams -- requires user being logged in
		FOLLOW_LIST = getSimpleFollowedList(r);
		getAPI('streams', async (q)=> { // global current live streams
			GLOBAL_LIVE_STREAMS = getFormattedStreamData(q);

			// updateCounters(); // even in failure, update counters (set back to empty)
			typeof callback === 'function' && callback();
		});
	});
}
function fetch_ownname(callback) {
	if (OWNNAME == "") {
		log_message("No name set... check storage");
		storage.local.get(["MYNAME"], (r) => {
			if (r["MYNAME"]) {
				OWNNAME = r["MYNAME"];
				typeof callback === 'function' && callback();
			} else {
				log_message("No name in cache... fetching!");
				
				getAPI("users/me", async(r)=>{
					OWNNAME = r.username;
					storage.local.set({"MYNAME" : OWNNAME});
					log_message("Name set to: " + OWNNAME);
					typeof callback === 'function' && callback();
				});
			}
		});
	} else {
		typeof callback === 'function' && callback();
	}
}
function fetch_multistream(callback) {
	getAPI('streams/' + OWNNAME + '/multi', (r)=> { // multistream info
		INVITES_COUNT = 0;
		for (m in r.received) {
			if (!r.received[m].accepted)
				INVITES_COUNT++;
		}
		storage.local.set({"MULTISTREAM" : r});
		typeof callback === 'function' && callback();
	})
}
function fetch_notifications(callback) { // TODO?
	//
}

// get default settings or fetch from storage
let SETTINGS_DEFAULTS = {};
var SETTINGS = {};
function initSettings(callback) {
	const url = browser.runtime.getURL('defaults.json');
	fetch(url)
		.then(e => e.json())
		.then(j =>
	{
		SETTINGS_DEFAULTS = j;
		SETTINGS = {
			...SETTINGS_DEFAULTS
		};
		callback();
	});
}

// main update function
var UPDATER = null;
async function update() {
	
	// fetch auth data from cookies, use that to get live streams info
	await new Promise((resolve) => {
		getCookies(["https://piczel.tv", "http://piczel.tv", "https://www.piczel.tv", "http://www.piczel.tv"], "authHeaders",
			function(a) { // success
				let b = decodeURIComponent(a);
				let c = JSON.parse(b);
				
				storage.sync.set({"OAUTH" : c}, function() {
					AUTH = c;

					// fetch piczel data
					fetch_streams(() => {
						fetch_ownname(() => {
							fetch_multistream(() => {
								fetch_notifications();
								resolve();
							});
						});
					});
				});
			},
			function() { // failure
				log_message("No auth field found... Not logged in?!");
				NEXT_ERROR = 2;
				FOLLOW_LIST = [];
				resolve();
			}
		);
	})
	
	// update badge and live count without fetching from Piczel...
	updateLive(() => {
		/* updateAPI(() => { */
			updateBadge(() => {
				updateMOTD(); // done!

				storage.local.set({"ERROR" : NEXT_ERROR});
				NEXT_ERROR = 0;
				UPDATER = setTimeout(update, SETTINGS.updateinterval * 1000);
			});
		/* }); */
	});
}
function startup() {
	storage.sync.get(["SETTINGS"], (r) => {
		for (let a in r["SETTINGS"]) {
			let setting = r["SETTINGS"][a];
			SETTINGS[a] = setting;
		}
		
		// set notif volume
		DING.volume = parseFloat(SETTINGS.dingvolume) / 100;
		
		// start the update!
		if (!UPDATER)
			update();
	});
}
function restart() {
	initSettings(startup);
}

// start!
restart();

// add listener to the desktop notification popups
browser.notifications.onClicked.addListener(function(notificationId) {
	if (notificationId !== "MOTD") {
		log_message("Notification clicked! ID: " + notificationId);
	
		window.open('https://piczel.tv/watch/' + notificationId.substr(0, notificationId.indexOf('__@@')), '_blank');
		browser.notifications.clear(notificationId, function() {});
	}
});

// listen for messages from other pages
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
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
					SETTINGS[s] = request[s];
				}
			}
			restart();
			break
		case "updateAll":
			restart();
			break
		case "purgeAll":
			SETTINGS = {};
			LIVE_COUNT = 0;
			INVITES_COUNT = 0;
			OWNNAME = "";
			FOLLOW_LIST = [];
			API_TOKEN = "";
			restart();
			break;
		case "notificationRemoved":
			NOTIFICATIONS -= 1;
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
});