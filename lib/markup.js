var blessed = require('blessed');
var _ = require('lazy.js');
var hljs = require('highlight.js'); hljs.configure({classPrefix: ''});
var cheerio = require('cheerio');
var entities = require('entities');
var Lexer = require('lex');

var util = require('./util');
var textUtil = require('./textUtil');
var logger = require('./logger');

function markup (text, style, start, end) {
  if (!text) return text;
  start = typeof start !== 'undefined' ? markup.index(text, start) : 0;
  end = typeof end !== 'undefined' ? markup.index(text, end) : Infinity;
  if (start === end) return text;

  style = style || '';
  var middle = style + text.slice(start, end) + markup.closeTags(style);
  return text.slice(0, start) + middle + text.slice(end);
}

markup._tagRegExp = /\{(\/?)([\w\-,;!#]*)\}/g;
markup._addTag = function (openTags, tag, close, name) {
  if (!close) openTags.push(tag);
  else if (!name) openTags.splice(0, Infinity);
  else {
    var lastTagIndex = openTags.lastIndexOf('{'+name+'}');
    if (lastTagIndex !== -1) openTags.splice(lastTagIndex, 1);
  }
};
markup.index = function (markedUp, index) {
  if (index <= 0) return 0;

  var textLength = 0;
  var i = 0;
  var done = false;
  var appendTags = [];
  function retVal () { return i - (textLength - index) - appendTags.join('').length; }
  function addText (text, real) {
    if (done) return retVal();
    i += (real || text).length;
    textLength += text.length;
    if (textLength == index) done = true;
    if (textLength > index) return retVal();
  }
  return new Lexer(addText)
    .addRule(/\{open\}/, addText.bind(null, '{'))
    .addRule(/\{close\}/, addText.bind(null, '}'))
    .addRule(markup._tagRegExp, function (tag, close, name) {
      i += tag.length;
      if (done) {
        markup._addTag.apply(null, [appendTags].concat(util.toArray(arguments)));
      }
    })
    .setInput(markedUp)
    .lex() || markedUp.length;
};
markup.closeTags = function (markedUp) {
  return (markedUp
    .replace(markup._tagRegExp, '{/$2}', 'g') // 'g' flag ignored :(
    .match(markup._tagRegExp) || [])
    .reverse()
    .join('');
};
markup.getOpenTags = function (text) {
  var openTags = [];
  new Lexer(function () {})
    .addRule(/\{(open|close)\}/, function () {})
    .addRule(markup._tagRegExp, markup._addTag.bind(null, openTags))
    .setInput(text)
    .lex();
  return openTags;
};

markup.highlight = function (text, language) {
  if (language === false) return [];

  var highlighted;
  if (language) {
    try { highlighted = hljs.highlight(language, text, true); } catch (e) {}
  }
  if (!highlighted) highlighted = hljs.highlightAuto(text);

  var $ = cheerio.load(highlighted.value); // Assumes hljs output doesn't use curlies

  var ranges = [];
  do {
    var lastElCount = elCount;
    var elCount = $('*:not(:has(*))').replaceWith(function () {
      var $el = $(this);
      var text = '';
      [this].concat($el.parents().get(), [$.root()]).reverse().reduce(function (parent, el) {
        $(parent).contents().each(function () {
          var $sibling = $(this);
          if ($sibling.is(el)) return false;
          text += $sibling.text();
        });
        return el;
      });
      var lines = textUtil.splitLines(text);
      var linesPlusEl = textUtil.splitLines(text + $el.text());
      ranges.push({
        range: [
          [lines      .length - 1, _(lines)      .last().length],
          [linesPlusEl.length - 1, _(linesPlusEl).last().length]
        ],
        properties: {
          type: 'syntax',
          syntax: ($el.attr('class') || '').match(/\S+/g) || []
        }
      });
      return $el.text();
    }).length;
  } while (lastElCount !== elCount);

  return ranges;
};

module.exports = markup;
