(function () {
  'use strict';

  var TERMS =
    '<p>The terms and conditions described below are a contractual agreement between you and the NW MT Veterans Stand Down and Food Pantry DME Loan Program. I understand and agree that the agreement unless special arrangements are made prior to such date. I accept responsibility for equipment loaned to me. I understand that the use of any equipment is at the recipient\'s own risk. In no event will NW Montana Veterans Stand Down and Food Pantry, be liable to any direct, indirect, or other consequential damages, or injuries from the use of the DME Loan Program. I understand that I am completely responsible for the proper and safe use of all equipment loaned to me by the DME Loan Program.</p>' +
    '<p>I understand that if I am an Occupational Therapist/Physical Therapist, I am also responsible for the equipment out on loan. In either getting the equipment returned or paid for by the due date.</p>';

  function initSignaturePad(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var drawing = false;

    function getX(e) {
      return (e.touches ? e.touches[0].clientX : e.clientX) - canvas.getBoundingClientRect().left;
    }

    function getY(e) {
      return (e.touches ? e.touches[0].clientY : e.clientY) - canvas.getBoundingClientRect().top;
    }

    function pointerDown(e) {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(getX(e), getY(e));
    }

    function pointerUp() {
      drawing = false;
    }

    function pointerMove(e) {
      if (!drawing) return;
      ctx.lineTo(getX(e), getY(e));
      ctx.stroke();
    }

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('mouseout', pointerUp);
    canvas.addEventListener('mousemove', pointerMove);
    canvas.addEventListener('touchstart', pointerDown);
    canvas.addEventListener('touchend', pointerUp);
    canvas.addEventListener('touchcancel', pointerUp);
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      pointerMove(e);
    });

    return {
      clear: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      hasSignature: function () {
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (var i = 3; i < data.length; i += 4) {
          if (data[i] !== 0) return true;
        }
        return false;
      },
      toDataURL: function () {
        return canvas.toDataURL('image/png');
      },
    };
  }

  function todayIso() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function isoFromDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  window.AgreementShared = {
    TERMS: TERMS,
    initSignaturePad: initSignaturePad,
    todayIso: todayIso,
    isoFromDate: isoFromDate,
    escapeHtml: escapeHtml,
  };
})();