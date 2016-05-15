'use strict'

var abstractPool = require('abstract-pool')

function QuadTree(x, y, w, h, options) {

    if( typeof x != 'number' || isNaN(x) )
        x = 0;
    if( typeof y != 'number' || isNaN(y) )
        y = 0;
    if( typeof w != 'number' || isNaN(w) )
        w = 10;
    if( typeof h != 'number' || isNaN(h) )
        h = 10;
    
    var maxc = 25;
    var leafratio = 0.5;
    if( options ) {
        if( typeof options.maxchildren == 'number' )
            if( options.maxchildren > 0 )
                maxc = options.maxchildren;
        if( typeof options.leafratio == 'number' )
            if( options.leafratio >= 0 )
                leafratio = options.leafratio;
    }

    // validate an input object
    function validate(obj) {
        if( !obj )
            return false;
        if( typeof obj.x != 'number' ||
            typeof obj.y != 'number' ||
            typeof obj.w != 'number' ||
            typeof obj.h != 'number' )
            return false;
        if( isNaN(obj.x) || isNaN(obj.y) ||
            isNaN(obj.w) || isNaN(obj.h) )
            return false;
        return true;
    }

    // test for deep equality for x,y,w,h
    function isequal(o1, o2) {
        if( o1.x == o2.x &&
            o1.y == o2.y &&
            o1.w == o2.w &&
            o1.h == o2.h )
            return true;
        return false;
    }

    // create a new quadtree node
    function createnode(x, y, w, h) {
        return {
            x: x,
            y: y,
            w: w,
            h: h,
            // Children (Things cleanly inside this node's bounds)
            c: [],
            // Fringe children (Things outside this node's bounds)
            l: [],
            // Child nodes
            n: []
        }
    }

    // root node used by this quadtree
    var root = createnode(x, y, w, h);

    // calculate distance between two points
    function distance(x1, y1, x2, y2) {
        return Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
    }
    
    // calculate distance between a point and a line (segment)
    function distancePL(x, y, x1, y1, dx1, dy1, len1 ) {
        if( !len1 ) // in case length is not provided, assume a line 
            len1 = -1;
        
        // x = x1 + s * dx1 + t * dy1
        // y = y1 + s * dy1 - t * dx1
        // x * dy1 - y * dx1 = x1 * dy1 - y1 * dx1 + 
        //                     t * ( dy1 * dy1 + dx1 * dx1 )
        var t = dx1 * dx1 + dy1 * dy1;
        if( t == 0 )
            return null;
        else {
            t = ( x * dy1 - y * dx1 - x1 * dy1 + y1 * dx1 ) / t;
            if( Math.abs(dx1) > Math.abs(dy1) )
                var s = ( x - x1 - t * dy1 ) / dx1;
            else
                var s = ( y - y1 + t * dx1 ) / dy1;
            if( ( s >= 0 && s <= len1 ) || len1 < 0 )
                return {
                    s: s,
                    t: t,
                    x: x1 + s * dx1,
                    y: y1 + s * dy1,
                    dist: Math.abs(t)
                };
            else if( s < 0 ) { 
                var dist = distance(x, y, x1, y1);
                return {
                    s: s,
                    dist: dist
                };
            } else {
                var dist = distance(x, y,
                                    x1 + len1*dx1, 
                                    y1 + len1*dy1);
                return {
                    s: s,
                    dist: dist
                };
            }
        }
    }
    
    // do two rectangles overlap ?
    function overlap_rect(o1, o2, buf) {
        if( o1.x + o1.w < o2.x ||
            o1.x > o2.x + o2.w ||
            o1.y + o1.h < o2.y ||
            o1.y > o2.y + o2.h )
            return false;
        return true;
    }

    var _isleafresult = { leaf: false, childnode: null }
    function isleaf(node, obj) {

        var leaf = false;
        if( obj.w * obj.h > node.w * node.h * leafratio )
            leaf = true;

        if( obj.x < node.x ||
            obj.y < node.y ||
            obj.x + obj.w > node.x + node.w ||
            obj.y + obj.h > node.y + node.h )
            leaf = true;

        var childnode = null;
        for( var ni = 0; ni < node.n.length; ni++ )
            if( overlap_rect(obj, node.n[ni], 0) ) {
                if( childnode ) { // multiple hits
                    leaf = true;
                    break;
                } else
                    childnode = node.n[ni];
            }
        
        _isleafresult.leaf = leaf
        _isleafresult.childnode = childnode
        return _isleafresult
    }

    // put an object to one of the child nodes of this node
    function put_to_nodes(node, obj) {
        var leaf = isleaf(node, obj);
        if( leaf && leaf.leaf )
            node.l.push(obj);
        else if( leaf.childnode )
            put(leaf.childnode, obj);
        else
            return;
    }

    // remove an object from this node
    function remove(node, obj, attr) {
        if( !validate(obj) )
            return 0;

        if( !attr )
            attr = false;
        else if( typeof attr != 'string' )
            attr = 'id';

        var count = 0;
        for( var ci = 0; ci < node.c.length; ci++ )
            if( ( attr && node.c[ci][attr] == obj[attr] ) ||
                ( !attr && isequal(node.c[ci], obj) ) ) {
                count++;
                node.c.splice(ci, 1);
                ci--;
            }

        for( var ci = 0; ci < node.l.length; ci++ )
            if( ( attr && node.l[ci][attr] == obj[attr] ) ||
                ( !attr && isequal(node.l[ci], obj) ) ) {
                count++;
                node.l.splice(ci, 1);
                ci--;
            }

        var leaf = isleaf(node, obj);
        if( !leaf.leaf && leaf.childnode )
            return count + remove(leaf.childnode, obj, attr);
        return count;
    }

    // put an object to this node
    function put(node, obj, removeflag) {

        if( !validate(obj) )
            return;

        if( node.n.length == 0 ) {
            node.c.push(obj);
            
            // subdivide
            if( node.c.length > maxc ) {
                var w2 = node.w / 2;
                var h2 = node.h / 2;
                node.n.push(createnode(node.x, node.y, w2, h2),
                            createnode(node.x + w2, node.y, w2, h2),
                            createnode(node.x, node.y + h2, w2, h2),
                            createnode(node.x + w2, node.y + h2, w2, h2));
                for( var ci = 0; ci < node.c.length; ci++ ) 
                    put_to_nodes(node, node.c[ci]);
                node.c.length = 0;
            }
        } else 
            put_to_nodes(node, obj);
    }

    // iterate through all objects in this node matching the given rectangle
    function get_rect(node, x, y, w, h, callback) {
        var rect
        var i = node.l.length
        while ( i-- ) {
            rect = node.l[i]
            if (x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( !callback(rect, 'l', i, node) )
                    return false;
        }
        i = node.c.length;
        while ( i-- ) {
            rect = node.c[i]
            if (x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( !callback(rect, 'c', i, node) )
                    return false;
        }
        i = node.n.length
        while ( i-- ) {
            rect = node.n[i]
            if (x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( !get_rect(rect, x, y, w, h, callback) )
                    return false;
        }
        return true;
    }

    var _ll_pool = [];
    var _ll_proto = { reclaim: reclaim_ll }
    var _construct_ll_node = () => {
        var ret = Object.create(_ll_proto)
        ret.entity = ret.next = null
        Object.seal(ret)
        return ret
    }
    function make_ll_node(entity, next) {
        var ret = _ll_pool.pop() ||
            (//do
                console.log('warning: somehow used up all 100 preallocated objects'),
                _construct_ll_node(null, null))
        ret.entity = entity
        ret.next = next
        return ret
    }
    ;(function prealloc (i) {
        if (!i) { return }
        _ll_pool.push(_construct_ll_node(null, null))
        prealloc(--i)
    })(100)
    function reclaim_ll(ll) {
        ll = ll || this
        while (ll && ll !== NIL) {
            _ll_pool.push(ll)
            ll = ll.next
        }
    }
    function get_non_static_ll(node, x, y, w, h, entity, results) {
        var rect
        var i = node.l.length
        while ( i-- ) {
            rect = node.l[i]
            if (rect.entity !== entity && x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( !rect.entity.static ) {
                    results = make_ll_node(rect.entity, results)
                }
        }
        i = node.c.length;
        while ( i-- ) {
            rect = node.c[i]
            if (rect.entity !== entity && x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( !rect.entity.static ) {
                    results = make_ll_node(rect.entity, results)
                }
        }
        i = node.n.length
        while ( i-- ) {
            rect = node.n[i]
            if (x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                results = get_non_static_ll(rect, x, y, w, h, entity, results)
        }
        return results
    }
    function get_solid_ll(node, x, y, w, h, entity, results) {
        var rect
        var i = node.l.length
        while ( i-- ) {
            rect = node.l[i]
            if (rect.entity !== entity && x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( rect.entity.solid ) {
                    results = make_ll_node(rect.entity, results)
                }
        }
        i = node.c.length;
        while ( i-- ) {
            rect = node.c[i]
            if (rect.entity !== entity && x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                if( rect.entity.solid ) {
                    results = make_ll_node(rect.entity, results)
                }
        }
        i = node.n.length
        while ( i-- ) {
            rect = node.n[i]
            if (x + w >= rect.x && x <= rect.x + rect.w && y + h >= rect.y && y <= rect.y + rect.h)
                results = get_solid_ll(rect, x, y, w, h, entity, results)
        }
        return results
    }

    var last_ll_returned = null

    // return the object interface
    return {
        get: function(obj, callback) {
            get_rect(root, obj.x, obj.y, obj.w, obj.h, callback);
        },
        getl: function (x, y, w, h, callback) {
            /* long-winded version of `get`. Avoids allocating the option object */
            get_rect(root, x, y, w, h, callback);
        },
        get_non_static_ll: function (x, y, w, h, entity, reclaimable) {
            if (reclaimable) {
                return get_non_static_ll(root, x, y, w, h, entity, NIL)
            }
            reclaim_ll.call(last_ll_returned)
            last_ll_returned = get_non_static_ll(root, x, y, w, h, entity, NIL)
            return last_ll_returned
        },
        get_solid_ll: function (x, y, w, h, entity, reclaimable) {
            if (reclaimable) {
                return get_solid_ll(root, x, y, w, h, entity, NIL)
            }
            reclaim_ll.call(last_ll_returned)
            last_ll_returned = get_solid_ll(root, x, y, w, h, entity, NIL)
            return last_ll_returned
        },
        getRoot: function () {
            return root;
        },
        put: function(obj) {
            put(root, obj);
        },
        remove: function(obj, attr) {
            return remove(root, obj, attr);
        }
    };
}

var NIL = Object.freeze({ entity: null, next: null, reclaim: () => null })
QuadTree.NIL = NIL
module.exports = QuadTree;
