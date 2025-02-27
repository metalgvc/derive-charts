
const tmpl = function(id, data){
    let html = jQuery('#templates div[data-id="'+ id +'"]').html();

    for (let key in data) {
        let val = String(data[key]);

        html = html.replaceAll('{'+ key +'}', val);

        // round decimal
        let regex = new RegExp(`\\{${key}\\|(\\.\\d)\\}`, "g");
        let matches = html.match(regex);

        if (matches && matches.length > 0) {
            for (match of matches) {
                let parts = match.split('|.');

                let rnd = parts[1].substring(0, parts[1].length - 1); // remove '}'
                rnd = parseInt(rnd);

                let valParts = val.split('.');
                if (rnd > 0 && valParts.length === 2) {
                    valParts[1] = valParts[1].substring(0, rnd);

                    // .00 -> .01
                    // if (parseInt(valParts[1]) === 0) {
                    //     valParts[1] = valParts[1].substring(0, valParts[1].length - 1) + '1';
                    // }
                }

                //console.log(match, valParts);
                html = html.replaceAll(match, valParts.join('.'));
            }
        }

    }

    // cleanup html
    //html= html.replace(/\{.*\}/g, '');

    return html;
};

const minmax = function(e){
    let $a = jQuery(e.currentTarget);
    let $target = $a.next();
    if ($a.text() === '-') {
        $target.hide();
        $a.text('+');
    } else {
        $target.show();
        $a.text('-');
    }
};

const formatExpDate = function(dateStr) {
    let year = dateStr.substring(0, 4);
    let month = dateStr.substring(4, 6) - 1; // Months are 0-based
    let day = dateStr.substring(6, 8);

    let date = new Date(year, month, day);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}