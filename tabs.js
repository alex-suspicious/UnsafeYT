var mainToggleButton = document.getElementById("toggle-main");
var mainDiv = document.getElementById("main-tab");

var membersToggleButton = document.getElementById("toggle-members");
var membersDiv = document.getElementById("members-tab");

function activeMainTab(){
    mainDiv.style.display = "block";
    membersDiv.style.display = "none";
    mainToggleButton.style.textDecoration = "underline";
    membersToggleButton.style.textDecoration = "none";
}

function activeMembersTab(){
    mainDiv.style.display = "none";
    membersDiv.style.display = "block";
    mainToggleButton.style.textDecoration = "none";
    membersToggleButton.style.textDecoration = "underline";
}

mainToggleButton.addEventListener("click", activeMainTab);
membersToggleButton.addEventListener("click", activeMembersTab);