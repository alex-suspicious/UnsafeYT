var background = chrome.extension.getBackgroundPage();
var theButton = document.querySelector("button");

function updateButton(onOrOff){
    theButton.innerHTML = onOrOff ? "Disable" : "Enable";
    theButton.className = onOrOff ? "buttonOFF" : "buttonON";
}        

function toggleButton(){
    background.isExtensionOn = !background.isExtensionOn;
    updateButton(background.isExtensionOn);
}

chrome.runtime.getBackgroundPage(function(backgroundpage) {
    background = backgroundpage;
    updateButton(backgroundpage.isExtensionOn);
    theButton.onclick = toggleButton;

    if (background.isExtensionOn == true){
        alert("on");
    }

    if (background.isExtensionOn == false){
        alert("off");
    }
});