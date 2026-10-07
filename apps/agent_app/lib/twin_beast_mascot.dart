import 'package:flutter/material.dart';

import 'omni_theme.dart';

class TwinBeastMascotSlot extends StatelessWidget {
  const TwinBeastMascotSlot({super.key, this.size = 112});

  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
        label: '雙生獸吉祥物',
        image: true,
        child: SizedBox(
          key: const Key('twin-beast-mascot-slot'),
          width: size,
          height: size * .7,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Transform.translate(
                offset: Offset(-size * .15, size * .03),
                child: Transform.rotate(
                  angle: -.08,
                  child: Container(
                    width: size * .52,
                    height: size * .46,
                    decoration: BoxDecoration(
                      color: const Color(0xFF393432),
                      borderRadius: BorderRadius.circular(size * .24),
                    ),
                  ),
                ),
              ),
              Transform.translate(
                offset: Offset(size * .15, -size * .03),
                child: Transform.rotate(
                  angle: .08,
                  child: Container(
                    width: size * .52,
                    height: size * .46,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF5F2EE),
                      border: Border.all(color: OmniColors.milkTea, width: 1.5),
                      borderRadius: BorderRadius.circular(size * .24),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}
