/**
 * @class Oskari.userinterface.component.buttons.DeleteButton
 *
 * Generic button component to make each button look the same in Oskari
 */
Oskari.clazz.define('Oskari.userinterface.component.buttons.DeleteButton',
    /**
     * @static @method create called automatically on construction
     *
     *
     */
    function () {
        var loc = Oskari.getLocalization('DivManazer');
        this.setTitle(loc ? loc.buttons['delete'] : 'Delete');
    },
    {},
    {
        extend: ['Oskari.userinterface.component.Button']
    }
);
