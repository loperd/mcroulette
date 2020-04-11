const Roulette = (function () {

    const rotationTokens = new WeakMap();

    function rotateForward(pixels) {
        this.container.dispatchEvent(new CustomEvent(rotationStartEventName, { detail: { prize: this.selectedPrize } }));

        pixels = Math.abs(pixels);
        let starter = Math.abs(Number(this.firstBlock.wrapper.style.marginLeft.replace("px", "")));

        let k = this.acceleration;
        let v0 = Math.sqrt(2 * k * pixels);
        let totalTime = v0 / k;

        let intervalMS = 1000 / this.fps;
        let intervalS = intervalMS / 1000;

        let blockWidth = this.prizeWidth + this.spacing;
        let t = 0;
        let currentBlock = 0;
        let played = false;
        let halfBlock = this.spacing + this.prizeWidth / 2;

        let token = setInterval(() => {

            if (t > totalTime) {
                this.stop();
                return;
            }

            let currentPos = (starter + (v0 * t - k * t * t / 2)) % this.width;

            if (Math.floor(currentPos / blockWidth) != currentBlock) {
                let block = this.firstBlock;
                this.list.appendChild(block.wrapper);
                block.wrapper.style.marginLeft = "0px";
                currentBlock = (currentBlock + 1) % this.prizes.length;
                played = false;
            }
            let margin = currentPos % blockWidth;
            this.firstBlock.wrapper.style.marginLeft = `-${margin}px`;
            if (margin > halfBlock && !played) {
                played = true;
                this.playClick();
            }

            t += intervalS;

        }, intervalMS);

        rotationTokens.set(this, token);
    }

    function rotateBackward(pixels) {
        // TODO
        throw NotImplementedException;
    }

    function rotateByTracks(prize, tracks, random, backward) {
        const blockWidth = this.prizeWidth + this.spacing;
        let currentBlock = this.selectedPrize;
        let length = Math.round(tracks) * this.width;
        if (backward)
        {
            // TODO
            length *= -1;
        }
        else
        {
            let currentPosition = currentBlock.index * blockWidth + (this.center - currentBlock.wrapper.offsetLeft);
            let destination = prize.index * blockWidth + this.spacing + this.prizeWidth / 2;
            if (destination < currentPosition)
                length += this.width - (currentPosition - destination);
            else
                length += destination - currentPosition;
            if (random)
                length += Math.random() * this.prizeWidth * 0.8 - this.prizeWidth * 0.4;
        }
        this.rotate(length);
    }

    function rotateByTime(prize, time, random, backward) {
        let v0 = this.acceleration * time;
        let l = v0 * v0 / (2 * this.acceleration);
        let tracks = Math.ceil(l / this.width);
        rotateByTracks.bind(this)(prize, tracks, random, backward);
    }

    return Roulette;
})();